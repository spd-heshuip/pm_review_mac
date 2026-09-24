import { Agent, CursorAgentError } from "@cursor/sdk";
import { cloudCreateOptions } from "./cloudOptions.js";
import type { AgentGateway, RunTerminal } from "./reviewApp.js";
import type { ImageAttachment } from "./input.js";

export class StartupError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export class CursorGateway implements AgentGateway {
  constructor(private readonly apiKey: string) {}

  async start(prompt: string, images: ImageAttachment[]) {
    const agent = await this.openNew();
    try {
      const run = await agent.send({
        text: prompt,
        images: images.map((image) => ({ data: image.dataBase64, mimeType: image.mimeType })),
      });
      return { agentId: agent.agentId, runId: run.id, terminal: this.finish(agent, run) };
    } catch (error) {
      await agent[Symbol.asyncDispose]();
      throw error;
    }
  }

  async followUp(agentId: string, prompt: string) {
    const agent = await Agent.resume(agentId, { apiKey: this.apiKey });
    const run = await agent.send(prompt);
    return { runId: run.id, terminal: this.finish(agent, run) };
  }

  async reattach(agentId: string, runId: string) {
    const agent = await Agent.resume(agentId, { apiKey: this.apiKey });
    const run = await Agent.getRun(runId, { runtime: "cloud", agentId, apiKey: this.apiKey });
    return { runId: run.id, terminal: this.finish(agent, run) };
  }

  async cancel(agentId: string, runId: string): Promise<void> {
    const run = await Agent.getRun(runId, { runtime: "cloud", agentId, apiKey: this.apiKey });
    if (run.supports("cancel")) await run.cancel();
  }

  private async openNew() {
    try {
      return await Agent.create(cloudCreateOptions(this.apiKey));
    } catch (error) {
      if (error instanceof CursorAgentError) throw new StartupError(error.message, error.isRetryable);
      throw error;
    }
  }

  private async finish(agent: Awaited<ReturnType<typeof Agent.create>>, run: Awaited<ReturnType<typeof agent.send>>): Promise<RunTerminal> {
    try {
      const result = await run.wait();
      const artifacts = await agent.listArtifacts();
      return {
        status: result.status,
        assistantText: result.result ?? "",
        artifacts: artifacts.map((artifact) => ({ path: artifact.path, updatedAt: artifact.updatedAt })),
        gitBranches: (result.git?.branches ?? []).flatMap((branch) => (branch.branch ? [branch.branch] : [])),
        readArtifact: async (path: string) => new Uint8Array(await agent.downloadArtifact(path)),
      };
    } finally {
      await agent[Symbol.asyncDispose]();
    }
  }
}
