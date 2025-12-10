use std::{collections::HashMap, path::Path};

use tokio::process::Command;

use crate::{command::CmdOverrides, executors::ExecutorError};

/// Environment variables and pre-commands to inject into executor processes
#[derive(Debug, Clone, Default)]
pub struct ExecutionEnv {
    pub vars: HashMap<String, String>,
    pub pre_commands: Vec<String>,
}

impl ExecutionEnv {
    pub fn new() -> Self {
        Self {
            vars: HashMap::new(),
            pre_commands: Vec::new(),
        }
    }

    /// Insert an environment variable
    pub fn insert(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.vars.insert(key.into(), value.into());
    }

    /// Merge additional vars into this env. Incoming keys overwrite existing ones.
    pub fn merge(&mut self, other: &HashMap<String, String>) {
        self.vars
            .extend(other.iter().map(|(k, v)| (k.clone(), v.clone())));
    }

    /// Return a new env with overrides applied. Overrides take precedence.
    pub fn with_overrides(mut self, overrides: &HashMap<String, String>) -> Self {
        self.merge(overrides);
        self
    }

    /// Return a new env with profile env from CmdOverrides merged in.
    pub fn with_profile(mut self, cmd: &CmdOverrides) -> Self {
        if let Some(ref profile_env) = cmd.env {
            self = self.with_overrides(profile_env);
        }
        if let Some(ref pre_cmds) = cmd.pre_commands {
            self.pre_commands.extend(pre_cmds.clone());
        }
        self
    }

    /// Add a pre-command to run before the executor starts
    pub fn add_pre_command(&mut self, cmd: impl Into<String>) {
        self.pre_commands.push(cmd.into());
    }

    /// Execute all pre-commands in order, stopping on first failure
    pub async fn execute_pre_commands(&self, current_dir: &Path) -> Result<(), ExecutorError> {
        for cmd in &self.pre_commands {
            tracing::debug!("Executing pre-command: {}", cmd);

            let output = Command::new("sh")
                .arg("-c")
                .arg(cmd)
                .current_dir(current_dir)
                .output()
                .await
                .map_err(|e| ExecutorError::PreCommandFailed {
                    command: cmd.clone(),
                    error: e.to_string(),
                })?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(ExecutorError::PreCommandFailed {
                    command: cmd.clone(),
                    error: stderr.to_string(),
                });
            }
        }
        Ok(())
    }

    /// Apply all environment variables to a Command
    pub fn apply_to_command(&self, command: &mut Command) {
        for (key, value) in &self.vars {
            command.env(key, value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_overrides_runtime_env() {
        let mut base = ExecutionEnv::default();
        base.insert("VK_PROJECT_NAME", "runtime");
        base.insert("FOO", "runtime");

        let mut profile = HashMap::new();
        profile.insert("FOO".to_string(), "profile".to_string());
        profile.insert("BAR".to_string(), "profile".to_string());

        let merged = base.with_overrides(&profile);

        assert_eq!(merged.vars.get("VK_PROJECT_NAME").unwrap(), "runtime");
        assert_eq!(merged.vars.get("FOO").unwrap(), "profile"); // overrides
        assert_eq!(merged.vars.get("BAR").unwrap(), "profile");
    }
}
