import { Agent, CursorAgentError, type Run } from "@cursor/sdk";
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
    try {
      const run = await agent.send(prompt);
      return { runId: run.id, terminal: this.finish(agent, run) };
    } catch (error) {
      await agent[Symbol.asyncDispose]();
      throw error;
    }
  }

  async reattach(agentId: string, runId: string) {
    const agent = await Agent.resume(agentId, { apiKey: this.apiKey });
    try {
      const run = await Agent.getRun(runId, { runtime: "cloud", agentId, apiKey: this.apiKey });
      return { runId: run.id, terminal: this.finishReattached(agent, run) };
    } catch (error) {
      await agent[Symbol.asyncDispose]();
      throw error;
    }
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
      const assistantText = result.status === "error"
        ? result.error?.message ?? result.result ?? ""
        : result.result ?? "";
      return await this.collectTerminal(agent, result.status, assistantText, result.git?.branches);
    } finally {
      await agent[Symbol.asyncDispose]();
    }
  }

  private async finishReattached(
    agent: Awaited<ReturnType<typeof Agent.create>>,
    run: Run,
  ): Promise<RunTerminal> {
    if (run.supports("wait")) return this.finish(agent, run);
    if (run.status === "running") {
      await agent[Symbol.asyncDispose]();
      return new Promise<RunTerminal>(() => undefined);
    }
    try {
      const assistantText = run.status === "error"
        ? run.error?.message ?? run.result ?? ""
        : run.result ?? "";
      return await this.collectTerminal(agent, run.status, assistantText, run.git?.branches);
    } finally {
      await agent[Symbol.asyncDispose]();
    }
  }

  private async collectTerminal(
    agent: Awaited<ReturnType<typeof Agent.create>>,
    status: RunTerminal["status"],
    assistantText: string,
    branches: Array<{ branch?: string }> | undefined,
  ): Promise<RunTerminal> {
    const artifacts = await agent.listArtifacts();
    const cached = new Map<string, Uint8Array>();
    for (const artifact of artifacts) {
      if (!artifact.path.endsWith(".md")) continue;
      cached.set(artifact.path, new Uint8Array(await agent.downloadArtifact(artifact.path)));
    }
    return {
      status,
      assistantText,
      artifacts: artifacts.map((artifact) => ({ path: artifact.path, updatedAt: artifact.updatedAt })),
      gitBranches: (branches ?? []).flatMap((branch) => (branch.branch ? [branch.branch] : [])),
      readArtifact: async (path: string) => {
        const bytes = cached.get(path);
        if (!bytes) throw new Error(`Artifact not cached: ${path}`);
        return bytes;
      },
    };
  }
}
