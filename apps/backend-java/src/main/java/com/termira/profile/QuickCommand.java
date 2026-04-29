package com.termira.profile;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record QuickCommand(
        String id,
        String profileId,
        String groupName,
        String name,
        String command,
        String note,
        String createdAt,
        String updatedAt
) {
}
