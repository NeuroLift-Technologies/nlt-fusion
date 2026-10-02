// NLTLevelPickerWidget.cpp
#include "UI/NLTLevelPickerWidget.h"

void UNLTLevelPickerWidget::NativeConstruct()
{
	Super::NativeConstruct();

	// Blueprint subclasses would build UI here
}

void UNLTLevelPickerWidget::NativeDestruct()
{
	Super::NativeDestruct();
}

void UNLTLevelPickerWidget::AddLevelEntry(const FName& LevelId, const FText& DisplayName)
{
	FLevelEntry Entry;
	Entry.LevelId = LevelId;
	Entry.DisplayName = DisplayName;
	Entries.Add(Entry);

	OnEntriesUpdated();
}

void UNLTLevelPickerWidget::ClearEntries()
{
	Entries.Empty();
	OnEntriesUpdated();
}

void UNLTLevelPickerWidget::ShowPicker()
{
	if (!IsInViewport())
	{
		AddToViewport(100);
	}

	SetVisibility(ESlateVisibility::Visible);

	// Make this widget receive input
	if (APlayerController* PC = GetOwningPlayer())
	{
		FInputModeUIOnly Mode;
		Mode.SetWidgetToFocus(TakeWidget());
		PC->SetInputMode(Mode);
		PC->bShowMouseCursor = true;
	}
}

void UNLTLevelPickerWidget::HidePicker()
{
	if (IsInViewport())
	{
		RemoveFromParent();
	}

	SetVisibility(ESlateVisibility::Hidden);

	// Restore input to game mode
	if (APlayerController* PC = GetOwningPlayer())
	{
		FInputModeGameOnly Mode;
		PC->SetInputMode(Mode);
		PC->bShowMouseCursor = false;
	}
}
