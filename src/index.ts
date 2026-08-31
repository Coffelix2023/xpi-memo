import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const VERSION = "0.1.0";

export default function xpiMemo(pi: ExtensionAPI): void {
  pi.registerCommand("xpi-memo", {
    description: "Show xpi-memo status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(`xpi-memo ${VERSION} loaded`);
    },
  });
}
