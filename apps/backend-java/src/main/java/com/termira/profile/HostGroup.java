package com.termira.profile;

public record HostGroup(
        String id,
        String name,
        int sortOrder,
        String createdAt,
        String updatedAt
) {
}
