package com.termira.profile;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ProfileStoreTest {
    @TempDir
    Path tempDir;

    @Test
    void persistsProfilesWithoutPlaintextSecrets() throws Exception {
        Path dbPath = tempDir.resolve("profiles.db");
        ProfileStore store = new ProfileStore(dbPath);

        HostProfile profile = store.createProfile(new HostProfileInput(
                null,
                "Production API",
                "10.0.8.12",
                22,
                "ubuntu",
                null,
                "Production",
                List.of("prod", "api"),
                "Saved profile",
                new AuthConfig("password", "cred_001", null, true),
                "/srv/app",
                true
        ));

        ProfileStore reloaded = new ProfileStore(dbPath);
        HostProfile persisted = reloaded.getProfile(profile.id());
        String dbBytes = Files.readString(dbPath, StandardCharsets.ISO_8859_1);

        assertThat(persisted.name()).isEqualTo("Production API");
        assertThat(persisted.groupName()).isEqualTo("Production");
        assertThat(persisted.auth().credentialRef()).isEqualTo("cred_001");
        assertThat(persisted.auth().saveCredential()).isTrue();
        assertThat(dbBytes).doesNotContain("super-secret-password");
    }

    @Test
    void savesForwardRulesAndQuickCommands() throws Exception {
        ProfileStore store = new ProfileStore(tempDir.resolve("profiles.db"));
        HostProfile profile = store.createProfile(new HostProfileInput(
                null,
                "Staging",
                "127.0.0.1",
                22,
                "deploy",
                null,
                "Staging",
                List.of(),
                null,
                new AuthConfig("privateKey", null, "~/.ssh/id_ed25519", false),
                null,
                false
        ));

        ForwardRule rule = store.saveForwardRule(new ForwardRuleInput(
                null,
                profile.id(),
                "Local admin",
                "local",
                "127.0.0.1",
                18080,
                "10.0.8.12",
                8080
        ));
        QuickCommand command = store.saveQuickCommand(new QuickCommandInput(
                null,
                profile.id(),
                "Inspect",
                "Tail logs",
                "tail -f app.log",
                "Read only"
        ));

        assertThat(store.listForwardRules(profile.id())).extracting(ForwardRule::id).containsExactly(rule.id());
        assertThat(store.listQuickCommands(profile.id())).extracting(QuickCommand::id).containsExactly(command.id());
    }
}
