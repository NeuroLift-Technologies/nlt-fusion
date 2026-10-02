// ASFDK Win64 stub implementations for Unreal plugin builds
// Provides inline stubs for ASFDK methods so the NLTGovernanceSubsystem
// can link on Win64 without requiring the full ASFDK-C++ CMake build.
// TODO: Replace with proper Win64 ASFDK library build when available.
//
// Every definition below is an exact out-of-line match for the declaration in
// D:\nlt-repos\asfdk-cplus\packages\*\include (verified by compiling this TU with
// cl.exe /std:c++20 /W4 /permissive- /we4668 ... - see the T2 report). Two rules this
// file lives by:
//
//  1. No out-of-line definition repeats a default argument that the header already
//     declares (ASFDK::honor has "options = {}", ASFDK::assessInteraction has
//     "sessionHistory = {}" and "userId = std::nullopt", ContinuityManager has
//     "storagePath = \".swp_storage\""). Repeating one is error C2572.
//
//  2. It never fabricates governance output. There is no ASFDK .lib on Win64, so an
//     unable-to-answer result must be reported as an inability, in the direction that
//     fails safe (escalate / inactive / flagged), never as a plausible-looking
//     "no crisis, everything operational" answer that downstream code would act on.
//
// ASFDK owns
//   std::unique_ptr<otoi::OTOIManager>                m_otoi;
//   std::unique_ptr<rrt::RRTAdvocate>                 m_rrt;
//   std::unique_ptr<sleepwalker::SleepwalkerProtocol> m_sleepwalker;
// The upstream ctor (packages\asfdk\src\ASFDK.cpp) allocates all three. This stub cannot
// do that: allocating them for real would require implementations from
// packages\rrt-advocate\src and packages\sleepwalker\src (CrisisEngine, CrisisDetector,
// KeywordLayer, StateDetector patterns, consent escalation rules, ...), which are not
// compiled on Win64, and anything invented there would be fabricated governance
// behaviour. ASFDK() therefore leaves all three pointers null on purpose.
// Hard rule that follows: NO stub in this file may dereference m_otoi / m_rrt /
// m_sleepwalker. Every stub answers from itself. If a future stub genuinely needs a
// pillar, port that pillar first - do not paper the gap over with a null dereference or
// an invented assessment.

#if defined(_WIN32)

#pragma warning(disable: 4668) // __GNUC__ undefined on MSVC: packages\include\tl\expected.hpp:642


#include <string>
#include <memory>
#include <optional>
#include <vector>
#include <chrono>

#include "asfdk/ASFDK.h"

// Pillar headers (for return types)
#include "toi/TOITypes.h"
#include "otoi/OTOITypes.h"
#include "rrt/RRTTypes.h"
#include "sleepwalker/SleepwalkerTypes.h"

namespace asfdk {

// Declared "ASFDK();" and "~ASFDK();" in asfdk/ASFDK.h, both public, defined in
// packages\asfdk\src\ASFDK.cpp. The defaulted ctor leaves the three pillar unique_ptrs
// null - deliberate, see the contract at the top of this file. Note the class deletes
// its copy ctor/assignment, so FAgentGovernanceState (which holds an ASFDK by value)
// stays non-copyable, exactly as with the real library.
ASFDK::ASFDK() = default;

// ~ASFDK() must be defined here: it is the only reason the unique_ptr members below do
// not become LNK2019 "unresolved external symbol ~ASFDK". Defaulting it also requires
// the destructors of all three pointees to be visible: ~otoi::OTOIManager and
// ~sleepwalker::SleepwalkerProtocol are implicit (no link dependency), while
// rrt::RRTAdvocate declares ~RRTAdvocate() out of line and is therefore defined below.
ASFDK::~ASFDK() = default;

toi::TOIDocument ASFDK::parseTOI(const nlohmann::json& /*json*/) {
    return toi::TOIDocument{};
}

tl::expected<toi::TOIDocument, toi::TOIError> ASFDK::safeParseTOI(const nlohmann::json& /*json*/) {
    toi::TOIError err{};
    err.code = toi::TOIError::Code::UnknownError;
    err.message = "ASFDK not built for Win64";
    return tl::unexpected(err);
}

bool ASFDK::validateTOI(const toi::TOIDocument& /*doc*/) {
    return false;
}

toi::TOIDocument ASFDK::resolveTOI(std::vector<toi::TOIDocument> docs) {
    return docs.empty() ? toi::TOIDocument{} : docs[0];
}

std::string ASFDK::canonicalize(const std::string& json) {
    return json;
}

otoi::OtoiCharter ASFDK::parseCharter(const nlohmann::json& /*json*/) {
    return otoi::OtoiCharter{};
}

tl::expected<otoi::OtoiCharter, otoi::OtoiError> ASFDK::safeParseCharter(const nlohmann::json& /*json*/) {
    otoi::OtoiError err{};
    err.code = otoi::OtoiErrorCode::Parse;
    err.message = "ASFDK not built for Win64";
    return tl::unexpected(err);
}

otoi::EffectivePolicy ASFDK::honor(const otoi::OtoiCharter& /*charter*/, const otoi::HonorOptions& /*options*/) {
    return otoi::EffectivePolicy{};
}

nlohmann::json ASFDK::propagate(const otoi::EffectivePolicy& /*policy*/, const std::string& /*agentId*/) {
    return nlohmann::json{};
}

rrt::CrisisAssessment ASFDK::assessMessage(const std::string& /*message*/) {
    return rrt::CrisisAssessment{};
}

sleepwalker::InteractionAssessment ASFDK::assessInteraction(
    const std::string& /*userInput*/,
    const std::vector<std::string>& /*sessionHistory*/,
    const std::optional<std::string>& /*userId*/
) {
    return sleepwalker::InteractionAssessment{};
}

void ASFDK::maintainContinuity(const std::string& /*userId*/, nlohmann::json /*sessionData*/) {
    // Stub
}

Envelope ASFDK::process(const std::string& /*input*/, const std::string& channel) {
    Envelope e;
    e.trusted = false;
    e.channel = channel;
    e.consentLevel = "none";
    e.payload = nlohmann::json{{"error", "Win64 ASFDK stub"}};
    e.flagged = true;
    e.flagReason = "ASFDK not built for Win64";
    return e;
}

AssessmentResult ASFDK::assess(const std::string& /*input*/) {
    // Value-initialise first: AssessmentResult has no default member initialisers, so a
    // plain "AssessmentResult result;" would leave requiresRrtaHandoff indeterminate.
    AssessmentResult Result{};

    // requiresRrtaHandoff = true is deliberate, and it is the fail-safe direction:
    // "false" would assert "no RRT Advocate handoff is required" - a safety-relevant
    // all-clear - on behalf of an assessor that does not exist on this platform.
    // Reporting the escalation instead means a caller does the cautious thing.
    Result.requiresRrtaHandoff = true;

    // Result.crisis stays std::nullopt and emotionalState stays value-initialised
    // (StateType::Neutral, confidence 0.0). There is no assessment to report; inventing
    // one (a GREEN CrisisAssessment, a "neutral, no check-in needed" state) is exactly
    // the fabrication this file must not do. Callers see requiresRrtaHandoff=true with
    // no crisis detail, which is the honest shape of "cannot assess here".
    return Result;
}

FoundationStatus ASFDK::getStatus() {
    FoundationStatus Status{};

    // Nothing in this build is actually running: no TOI/OTOI/RRT/SWP implementation
    // exists on Win64, so every pillar is reported inactive rather than copying the
    // upstream values (toi_active/rrt_active/swp_active = true, overall = "operational"),
    // which would be a fabricated all-clear.
    Status.toi_active = false;
    Status.otoi_active = false;
    Status.rrt_active = false;
    Status.swp_active = false;
    Status.otoi_mode = "unavailable";

    // Loud, matching the flagReason process() sets. Upstream returns "operational" or
    // "degraded"; an unexpected string here is the point - it must not read as healthy.
    Status.overall = "ASFDK not built for Win64";
    return Status;
}

// Declared in asfdk/ASFDK.h ("nlohmann::json toJson() const;") and defined in
// packages\asfdk\src\ASFDK.cpp, which is not compiled on Win64. Defined here so that any
// Win64 caller links instead of hitting LNK2019. It only serialises the fields above, so
// it adds no governance data of its own.
nlohmann::json FoundationStatus::toJson() const {
    return nlohmann::json{
        {"toi_active", toi_active},
        {"otoi_active", otoi_active},
        {"rrt_active", rrt_active},
        {"swp_active", swp_active},
        {"otoi_mode", otoi_mode},
        {"overall", overall}
    };
}

} // namespace asfdk

namespace sleepwalker {
    SleepwalkerProtocol::SleepwalkerProtocol() 
        : m_stateDetector()
        , m_consentManager(nlohmann::json::object())
        , m_continuityManager()
        , m_userToi(nlohmann::json::object())
        , m_privacyMode("local_only")
        , m_loggingEnabled(true)
    {
    }
    SleepwalkerProtocol::SleepwalkerProtocol(const Options& options) 
        : m_stateDetector()
        , m_consentManager(options.userToi)
        , m_continuityManager(options.storagePath)
        , m_userToi(options.userToi)
        , m_privacyMode(options.privacyMode)
        , m_loggingEnabled(options.loggingEnabled)
    {
    }

    // Win64 link-time member stubs (no-op; real implementations come from the
    // full ASFDK-C++ CMake build on Linux / when libasfdk is built for Win64).
    // Signatures are exactly as declared in sleepwalker\StateDetector.h,
    // ConsentManager.h and ContinuityManager.h - note that the managers' "explicit"
    // is a declaration-only property and must NOT be repeated on the definition, and
    // that ContinuityManager's default argument (".swp_storage") stays in the header.
    // These construct the member state consistently (nothing left uninitialised, no
    // null nlohmann::json) but deliberately perform NO governance work: upstream
    // ContinuityManager() also creates the storage directory on disk, StateDetector()
    // compiles the detection regexes and ConsentManager() reads the "swp" section of
    // the user TOI. A stub must not create directories or invent consent defaults, so
    // none of that happens here and the corresponding detection/consent methods are
    // intentionally left undefined (referencing them is a loud LNK2019, not a
    // silently wrong answer).
    StateDetector::StateDetector() = default;
    ConsentManager::ConsentManager(const nlohmann::json& userToi)
        : m_userToi(userToi)
        , m_swpConfig(nlohmann::json::object())
    {
    }
    ContinuityManager::ContinuityManager(const std::string& storagePath)
        : m_storagePath(storagePath)
    {
    }
} // namespace sleepwalker

namespace rrt {
    // Required by asfdk::ASFDK::~ASFDK() which holds unique_ptr<RRTAdvocate>.
    RRTAdvocate::~RRTAdvocate() = default;
} // namespace rrt

#endif // defined(_WIN32)