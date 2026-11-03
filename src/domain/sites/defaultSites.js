import { CONFIG } from "../../config.js";
import { ConfirmOnlyAdapter, hostAdapter } from "./confirmOnlyAdapter.js";
import callSites from "./callSites.json";
import { KonveneAdapter } from "./konveneAdapter.js";
import { SiteRegistry } from "./siteRegistry.js";
/**
 * The one place that lists the sites we know. Order matters: first match wins.
 * The web call sites come from callSites.json, the same list the build uses for the page scripts that notice a
 * shared screen, so a site is added in one place.
 */
export function createSiteRegistry() {
  const generic = new ConfirmOnlyAdapter({
    id: "web",
    name: (url) => url.hostname || "this page",
    matches: () => true,
  });
  return new SiteRegistry(
    [
      new KonveneAdapter(CONFIG.konveneOrigins),
      ...callSites.map((s) =>
        hostAdapter(
          s.id,
          s.name,
          s.origins.map((o) => new URL(o).hostname),
        ),
      ),
    ],
    generic,
  );
}
