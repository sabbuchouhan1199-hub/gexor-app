import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ApiClient } from "./api/client";
import { ProductionWorkspace, SafeMarkdown } from "./Workspace";

it("renders fenced code while treating HTML as text", () => {
  const { container } = render(<SafeMarkdown text={'Hello <img src=x onerror=alert(1)>\n```ts\nconst value = 1;\n```'} />);
  expect(screen.getByText(/Hello <img/)).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("const value = 1;")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
});

it("enforces MAX_MESSAGE_TEXT_LENGTH (4000) on composer textarea", () => {
  const auth = {
    user: { userId: "u1", email: "e@x.com", displayName: "User", status: "active" as const, createdAt: "", updatedAt: "" },
    session: { sessionId: "s1", userId: "u1", status: "active" as const, createdAt: "", expiresAt: "", lastSeenAt: "" },
    workspace: { workspaceId: "w1", ownerUserId: "u1", name: "Workspace", status: "active" as const, createdAt: "", updatedAt: "" },
    membership: { membershipId: "m1", workspaceId: "w1", userId: "u1", role: "owner" as const, status: "active" as const, createdAt: "", updatedAt: "" },
  };
  render(<ProductionWorkspace current={auth} client={new ApiClient("w1")} logout={() => {}} openProviders={() => {}} />);
  const textarea = screen.getByPlaceholderText("Message Gexor…");
  expect(textarea).toHaveAttribute("maxLength", "4000");
});
