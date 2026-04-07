package presence

// FilterPayload masks fields based on buddy's privacy_level setting.
// Level 1: event type + buddy_id only (online/offline)
// Level 2: + status distinction (IDLE/ACTIVE)
// Level 3: + intensity
// Level 4: + category_hue
func FilterPayload(event PresenceEvent, buddyPrivacyLevel int) PresenceEvent {
	filtered := PresenceEvent{
		Event:   event.Event,
		BuddyID: event.BuddyID,
		Ts:      event.Ts,
	}

	if buddyPrivacyLevel >= 2 {
		filtered.PrivacyLevel = event.PrivacyLevel
	}

	if buddyPrivacyLevel >= 3 {
		filtered.Intensity = event.Intensity
	}

	if buddyPrivacyLevel >= 4 {
		filtered.CategoryHue = event.CategoryHue
	}

	return filtered
}
