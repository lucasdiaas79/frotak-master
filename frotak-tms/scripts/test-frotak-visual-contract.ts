import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

test("shared controls keep the FrotaK geometry", () => {
  const button = source("src/components/ui/button.tsx");
  const input = source("src/components/ui/input.tsx");
  const card = source("src/components/ui/card.tsx");
  const dialog = source("src/components/ui/dialog.tsx");
  const tabs = source("src/components/ui/tabs.tsx");

  assert.match(button, /rounded-full/);
  assert.match(input, /field-shell/);
  assert.match(card, /rounded-\[25px\]/);
  assert.match(dialog, /rounded-\[28px\]/);
  assert.match(tabs, /rounded-full/);
});

test("shared page components remain the source of truth", () => {
  const pageHeader = source("src/components/PageHeader.tsx");
  const modal = source("src/components/Modal.tsx");
  const frotakPage = source("src/components/frotak/FrotakPage.tsx");

  assert.match(pageHeader, /FrotakPageHeader/);
  assert.match(modal, /DialogContent/);
  assert.match(frotakPage, /FrotakFilterBar/);
  assert.match(frotakPage, /FrotakMetric/);
  assert.match(frotakPage, /FrotakEmptyState/);
});

test("official colors and card treatment remain available to every tenant", () => {
  const styles = source("src/styles.css");

  assert.match(styles, /--primary: #237b3b/);
  assert.match(styles, /--operational: #44ad60/);
  assert.match(styles, /--brand-pigment: #66bb1a/);
  assert.match(styles, /--background: #edf1ef/);
  assert.match(styles, /--card: #fafcfb/);
  assert.match(styles, /\.premium-card[\s\S]*box-shadow: none/);
});
