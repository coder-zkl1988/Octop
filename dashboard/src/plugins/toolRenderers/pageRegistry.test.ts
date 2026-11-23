import { beforeEach, describe, expect, it } from "vitest";
import { createPluginUiHost } from "./host";
import { getPluginPage, unregisterPluginPages } from "./registry";

const First = () => null;
const Replacement = () => null;

describe("plugin page registry", () => {
  beforeEach(() => unregisterPluginPages("example"));

  it("replaces a page with the same plugin and id", () => {
    const host = createPluginUiHost("example");
    host.registerPage({ id: "main", title: "First", component: First });
    host.registerPage({ id: "main", title: "Next", component: Replacement });

    expect(getPluginPage("example")).toMatchObject({
      pluginId: "example",
      title: "Next",
      component: Replacement,
    });
  });

  it("unregisters all pages owned by one plugin", () => {
    const host = createPluginUiHost("example");
    host.registerPage({ id: "main", component: First });
    unregisterPluginPages("example");
    expect(getPluginPage("example")).toBeNull();
  });
});
