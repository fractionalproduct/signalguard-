/**
 * Versioned prompt registry. Prompts are configuration, never a security
 * boundary — but they must be versioned so every agent run records exactly which
 * prompt produced it (reproducibility + audit).
 */
import type { PromptVersion } from "./types.js";

export class PromptRegistry {
  /** agentId -> version -> PromptVersion */
  private readonly byAgent = new Map<string, Map<string, PromptVersion>>();

  add(prompt: PromptVersion): void {
    const versions = this.byAgent.get(prompt.agentId) ?? new Map<string, PromptVersion>();
    if (versions.has(prompt.version)) {
      throw new Error(
        `Prompt ${prompt.agentId}@${prompt.version} already exists; versions are immutable.`,
      );
    }
    if (prompt.active) {
      // Only one active version per agent.
      for (const existing of versions.values()) {
        if (existing.active) {
          throw new Error(
            `Agent "${prompt.agentId}" already has an active prompt (${existing.version}). ` +
              `Deactivate it before adding another active version.`,
          );
        }
      }
    }
    versions.set(prompt.version, prompt);
    this.byAgent.set(prompt.agentId, versions);
  }

  getActive(agentId: string): PromptVersion {
    const versions = this.byAgent.get(agentId);
    const active = versions && [...versions.values()].find((p) => p.active);
    if (!active) throw new Error(`No active prompt for agent "${agentId}".`);
    return active;
  }

  get(agentId: string, version: string): PromptVersion {
    const prompt = this.byAgent.get(agentId)?.get(version);
    if (!prompt) throw new Error(`No prompt ${agentId}@${version}.`);
    return prompt;
  }

  listVersions(agentId: string): PromptVersion[] {
    return [...(this.byAgent.get(agentId)?.values() ?? [])];
  }
}
