using System;
using System.Globalization;
using Godot;

namespace NltWorldEngine.Agents;

/// <summary>
/// Turns free-form model text into a validated <see cref="AgentAction"/>.
///
/// This exists because a 0.6B model asked for JSON will sometimes return JSON with a missing quote,
/// an invented field, or prose wrapped around it. Prompting alone does not fix that. Two defences
/// are stacked:
///
/// <list type="number">
/// <item><b>Grammar at the source.</b> NobodyWho exposes GBNF, which constrains the model's
/// vocabulary so the only reachable outputs are well-formed. That is enforced inference-side and is
/// the primary defence.</item>
/// <item><b>Tolerant parse here.</b> Whatever still arrives is read leniently, then validated against
/// the same seam every other decision passes through. A malformed decision becomes
/// <see cref="AgentAction.Idle"/> — never a crash, never an exception into the game loop.</item>
/// </list>
///
/// Parsing is forgiving about <i>form</i> and strict about <i>meaning</i>: it finds the numbers
/// inside noisy text, but it never invents a heading the model did not state.
/// </summary>
public static partial class DecisionParser
{
    /// <summary>
    /// Parse a model response into an action. Never throws.
    /// </summary>
    /// <param name="text">Raw model output; may include prose or a fenced code block.</param>
    /// <param name="action">The parsed action, or <see cref="AgentAction.Idle"/> if unusable.</param>
    /// <param name="error">Null on success, otherwise why the text could not be used.</param>
    public static bool TryParse(string? text, out AgentAction action, out string? error)
    {
        action = AgentAction.Idle;
        error = null;

        if (string.IsNullOrWhiteSpace(text))
        {
            error = "empty response";
            return false;
        }

        var body = ExtractJsonObject(text);
        if (body == null)
        {
            error = "no JSON object found";
            return false;
        }

        // move_x / move_z are the only required fields. A model that omits both has decided to hold
        // still, which is a legitimate answer, so that is not treated as a failure.
        var x = ReadNumber(body, "move_x");
        var z = ReadNumber(body, "move_z");

        if (x == null || z == null)
        {
            if (!HasKey(body, "move_x") && !HasKey(body, "move_z"))
                return true; // explicit hold

            error = "only one of move_x / move_z present";
            return false;
        }

        var direction = new Vector3(x.Value, 0f, z.Value);

        // Clamp rather than reject: an over-long vector is a model aiming past the edge of the
        // world — a direction with a magnitude mistake, not a nonsense direction.
        if (direction.Length() > 1f)
            direction = direction.Normalized();

        action = new AgentAction(direction, ReadInteraction(body));
        return true;
    }

    /// <summary>
    /// The grammar constraining the model. Held next to the parser so the two cannot drift:
    /// whatever this permits, <see cref="TryParse"/> must accept.
    /// </summary>
    public const string ActionGrammar =
        "root ::= \"{\" ws \"\\\"move_x\\\"\" ws \":\" ws num ws \",\" ws \"\\\"move_z\\\"\" ws \":\" ws num " +
        "ws \",\" ws \"\\\"act\\\"\" ws \":\" ws interaction ws \"}\"\n" +
        "num ::= \"0\" | \"1\" | \"-1\" | \"0.\" [0-9]{1,3} | \"-0.\" [0-9]{1,3}\n" +
        "interaction ::= \"none\" | \"observe\" | \"interact\" | \"rest\"\n" +
        "ws ::= \" \"?";

    /// <summary>
    /// Find the outermost {...} run, tolerating a fenced block or surrounding prose. Brace counting
    /// is string-aware, so a brace inside a quoted value does not truncate the object early.
    /// </summary>
    private static string? ExtractJsonObject(string text)
    {
        var start = text.IndexOf('{');
        if (start < 0)
            return null;

        var depth = 0;
        var inString = false;
        var escaped = false;

        for (var i = start; i < text.Length; i++)
        {
            var c = text[i];

            if (inString)
            {
                if (escaped) { escaped = false; continue; }
                if (c == '\\') { escaped = true; continue; }
                if (c == '"') inString = false;
                continue;
            }

            switch (c)
            {
                case '"': inString = true; break;
                case '{': depth++; break;
                case '}':
                    depth--;
                    if (depth == 0)
                        return text[start..(i + 1)];
                    break;
            }
        }

        // Unterminated — take the remainder and let the field readers salvage what they can.
        return text[start..];
    }

    /// <summary>Locate <c>"key"</c> and confirm a colon follows it.</summary>
    private static bool TryFind(string json, string key, out int valueStart)
    {
        valueStart = -1;
        var needle = "\"" + key + "\"";
        var at = json.IndexOf(needle, StringComparison.Ordinal);
        if (at < 0)
            return false;

        var i = at + needle.Length;
        while (i < json.Length && char.IsWhiteSpace(json[i]))
            i++;

        if (i >= json.Length || json[i] != ':')
            return false;

        i++;
        while (i < json.Length && char.IsWhiteSpace(json[i]))
            i++;

        valueStart = i;
        return true;
    }

    /// <summary>True when the key is present with a well-formed <c>"key":</c> prefix.</summary>
    private static bool HasKey(string json, string key) => TryFind(json, key, out _);

    private static float? ReadNumber(string json, string key)
    {
        if (!TryFind(json, key, out var at))
            return null;

        var start = at;
        while (at < json.Length &&
               (json[at] == '-' || json[at] == '+' || char.IsDigit(json[at]) || json[at] == '.'))
            at++;

        if (at == start)
            return null;

        // Invariant culture is deliberate: a model emits '.' as the decimal mark regardless of the
        // machine's locale, and a comma-decimal parse would silently yield 0.
        return float.TryParse(json[start..at], NumberStyles.Float, CultureInfo.InvariantCulture, out var v)
            ? v
            : null;
    }

    private static AgentInteraction ReadInteraction(string json)
    {
        if (!TryFind(json, "act", out var at))
            return AgentInteraction.None;

        // First vocabulary word in the remainder wins. The grammar makes the words mutually
        // exclusive, so there is no ambiguity to resolve and no need to score candidates.
        var rest = json[at..];
        foreach (var token in new[] { "none", "observe", "interact", "rest" })
        {
            if (rest.IndexOf(token, StringComparison.Ordinal) < 0)
                continue;

            return token switch
            {
                "observe" => AgentInteraction.Observe,
                "interact" => AgentInteraction.Interact,
                "rest" => AgentInteraction.Rest,
                _ => AgentInteraction.None,
            };
        }

        return AgentInteraction.None;
    }
}