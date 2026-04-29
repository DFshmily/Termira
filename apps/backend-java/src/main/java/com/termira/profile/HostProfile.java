package com.termira.profile;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record HostProfile(
        String id,
        String name,
        String host,
        int port,
        String username,
        String groupId,
        String groupName,
        List<String> tags,
        String note,
        AuthConfig auth,
        String defaultRemotePath,
        boolean favorite,
        String createdAt,
        String updatedAt,
        String lastConnectedAt
) {
}
