package com.termira.profile;

public record QuickCommandInput(
        String id,
        String profileId,
        String groupName,
        String name,
        String command,
        String note
) {
}
