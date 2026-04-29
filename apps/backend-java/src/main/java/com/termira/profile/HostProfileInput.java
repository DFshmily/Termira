package com.termira.profile;

import java.util.List;

public record HostProfileInput(
        String id,
        String name,
        String host,
        Integer port,
        String username,
        String groupId,
        String groupName,
        List<String> tags,
        String note,
        AuthConfig auth,
        String defaultRemotePath,
        Boolean favorite
) {
    public HostProfileInput withAuth(AuthConfig nextAuth) {
        return new HostProfileInput(
                id,
                name,
                host,
                port,
                username,
                groupId,
                groupName,
                tags,
                note,
                nextAuth,
                defaultRemotePath,
                favorite
        );
    }
}
