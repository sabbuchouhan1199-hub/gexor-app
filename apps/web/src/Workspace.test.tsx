import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { SafeMarkdown } from "./Workspace";

it("renders fenced code while treating HTML as text", () => {
  const { container } = render(<SafeMarkdown text={'Hello <img src=x onerror=alert(1)>\n```ts\nconst value = 1;\n```'} />);
  expect(screen.getByText(/Hello <img/)).toBeInTheDocument();
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("const value = 1;")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
});
