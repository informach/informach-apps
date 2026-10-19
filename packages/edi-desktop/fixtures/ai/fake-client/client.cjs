// A stand-in for Claude Code and Codex, installed by the tests as an npm script. It answers the
// status commands, reads the message from standard input, calls the application's MCP server
// with the run's token (when asked) and reports what it saw as its answer.
const args = process.argv.slice(2);
const out = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);

if (args[0] === "--version") {
  console.log("9.9.9 (fake)");
  process.exit(0);
}
if (args[0] === "features") {
  console.log("shell_tool   stable  true\nsqlite       stable  true");
  process.exit(0);
}
if (args[0] === "auth") {
  console.log(JSON.stringify({ authMethod: process.env.FAKE_AUTH || "claude.ai" }));
  process.exit(0);
}
if (args[0] === "login") {
  console.log(
    process.env.FAKE_AUTH === "api_key" ? "Logged in using an API key" : "Logged in using ChatGPT",
  );
  process.exit(0);
}

const after = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

async function main(prompt) {
  const claude = args[0] === "-p";
  let server;
  let url;
  let tokenEnv;
  let resume;
  if (claude) {
    const config = JSON.parse(after("--mcp-config"));
    server = Object.keys(config.mcpServers)[0];
    url = config.mcpServers[server].url;
    tokenEnv = /\$\{(\w+)\}/.exec(config.mcpServers[server].headers.Authorization)[1];
    resume = after("--resume");
    if (resume === "sessao-perdida") {
      out({ type: "result", is_error: true, result: "No conversation found with session ID" });
      process.exit(1);
    }
    out({
      type: "system",
      subtype: "init",
      session_id: "sessao-1",
      mcp_servers: [{ name: server, status: "connected" }],
    });
  } else {
    for (const arg of args) {
      const found = /^mcp_servers\.(\w+)\.(url|bearer_token_env_var)=(.*)$/.exec(arg);
      if (!found) continue;
      server = found[1];
      if (found[2] === "url") url = JSON.parse(found[3]);
      else tokenEnv = JSON.parse(found[3]);
    }
    resume = args.includes("resume") ? args[args.indexOf("resume") + 1] : undefined;
    out({ type: "thread.started", thread_id: "fio-1" });
  }
  const token = tokenEnv ? process.env[tokenEnv] : undefined;
  const report = {
    prompt,
    marker: args.some((arg) => arg.includes("MARCA")),
    token: token ?? null,
    apiKey: !!process.env.ANTHROPIC_API_KEY,
    resume: resume ?? null,
    personal: args.includes('forced_login_method="chatgpt"'),
    tool: null,
  };
  if (prompt.includes("CHAME")) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "read_doc", arguments: {} },
      }),
    });
    const body = await response.json();
    report.tool = body.result.content[0].text;
    if (claude) {
      out({
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "t1", name: `mcp__${server}__read_doc` }] },
      });
      out({
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "t1", content: report.tool }] },
      });
    } else {
      out({
        type: "item.completed",
        item: {
          id: "t1",
          type: "mcp_tool_call",
          server,
          tool: "read_doc",
          status: "completed",
          result: { content: [{ type: "text", text: report.tool }] },
        },
      });
    }
  }
  if (!claude && prompt.includes("SHELL")) {
    out({ type: "item.started", item: { id: "c1", type: "command_execution" } });
    setInterval(() => {}, 1000);
    return;
  }
  if (claude) {
    out({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: JSON.stringify(report) },
      },
    });
    out({ type: "result", session_id: "sessao-1", usage: { input_tokens: 3, output_tokens: 4 } });
  } else {
    out({
      type: "item.completed",
      item: { id: "m1", type: "agent_message", text: JSON.stringify(report) },
    });
    out({ type: "turn.completed", usage: { input_tokens: 3, output_tokens: 4 } });
  }
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  main(input).catch((error) => {
    process.stderr.write(String(error));
    process.exit(2);
  });
});
