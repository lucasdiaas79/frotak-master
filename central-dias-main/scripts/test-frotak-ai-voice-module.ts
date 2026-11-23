// Voz da Frotak IA sem rede: guarda de interrupcao enquanto a IA fala e destravamento da fala.
// npm run test:modules
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBargeInGuard,
  frameLevel,
} from "../src/modules/frotak-ai/domain/frotakLiveBargeInGuard.ts";
import { createStallWatch } from "../src/modules/frotak-ai/domain/frotakLiveStallWatch.ts";

const FRAME = 960; // 20 ms a 48 kHz

// Senoide com o nivel RMS pedido: basta para o guarda, que olha so o nivel de cada quadro.
function tone(level: number, seed = 0) {
  const frame = new Float32Array(FRAME);
  const amplitude = level * Math.SQRT2;
  for (let index = 0; index < FRAME; index += 1) {
    frame[index] = amplitude * Math.sin((index + seed) * 0.13);
  }
  return frame;
}

function isSilent(frames: Float32Array[]) {
  return frames.every((frame) => frameLevel(frame) === 0);
}

// Ensina o guarda: sala silenciosa e uma fala do usuario com a IA calada.
function trainedGuard() {
  const guard = createBargeInGuard();
  for (let index = 0; index < 50; index += 1) guard.process(tone(0.003, index), false);
  for (let index = 0; index < 150; index += 1) guard.process(tone(0.1, index), false);
  for (let index = 0; index < 50; index += 1) guard.process(tone(0.003, index), false);
  return guard;
}

test("IA calada: tudo passa, inclusive voz baixa", () => {
  const guard = createBargeInGuard();
  const soft = tone(0.008);
  const output = guard.process(soft, false);
  assert.equal(output.length, 1);
  assert.equal(output[0], soft);
});

test("IA falando: eco da propria voz vira silencio", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 100; index += 1) {
    assert.ok(isSilent(guard.process(tone(0.006, index), true)), `quadro ${index}`);
  }
});

test("IA falando: conversa ao fundo (10 dB abaixo do usuario) nao interrompe", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 150; index += 1) {
    assert.ok(isSilent(guard.process(tone(0.03, index), true)), `quadro ${index}`);
  }
});

test("IA falando: batida curta, mesmo alta, nao interrompe", () => {
  const guard = trainedGuard();
  const outputs = [
    ...[0, 1, 2, 3].map((index) => guard.process(tone(0.4, index), true)),
    ...[4, 5, 6].map((index) => guard.process(tone(0.002, index), true)),
  ];
  assert.ok(outputs.every(isSilent));
});

test("IA falando: voz do usuario libera a interrupcao sem perder o comeco", () => {
  const guard = trainedGuard();
  const outputs: Float32Array[][] = [];
  for (let index = 0; index < 14; index += 1) outputs.push(guard.process(tone(0.09, index), true));
  const opened = outputs.findIndex((frames) => !isSilent(frames));
  assert.equal(opened, 10, "abre no 11o quadro de voz (220 ms)");
  assert.ok(outputs[opened].length >= 11, "os quadros guardados seguem juntos");
  assert.equal(outputs[opened + 1].length, 1, "depois, um quadro por vez");
  assert.ok(guard.state().open);
});

test("IA falando: fala com pausas curtas entre as silabas tambem interrompe", () => {
  const guard = trainedGuard();
  const pattern = [1, 1, 1, 1, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1];
  const opened = pattern.findIndex(
    (voiced, index) => !isSilent(guard.process(tone(voiced ? 0.09 : 0.002, index), true)),
  );
  assert.equal(opened, 13, "abre quando junta 11 quadros de voz na janela");
});

test("IA falando: barulho intermitente, em metade dos quadros, nao interrompe", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 200; index += 1) {
    const level = index % 2 === 0 ? 0.2 : 0.002;
    assert.ok(isSilent(guard.process(tone(level, index), true)), `quadro ${index}`);
  }
});

test("IA falando: voz um pouco mais baixa que a de costume tambem interrompe", () => {
  const guard = trainedGuard();
  let opened = false;
  for (let index = 0; index < 20; index += 1) {
    if (!isSilent(guard.process(tone(0.05, index), true))) opened = true;
  }
  assert.ok(opened);
});

test("depois de liberada, a interrupcao fica aberta nas pausas curtas e fecha depois", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 12; index += 1) guard.process(tone(0.09, index), true);
  for (let index = 0; index < 30; index += 1) {
    assert.ok(!isSilent(guard.process(tone(0.002, index), true)), `pausa ${index}`);
  }
  for (let index = 0; index < 20; index += 1) guard.process(tone(0.002, index), true);
  assert.ok(isSilent(guard.process(tone(0.002), true)));
});

test("barulho da sala medido antes vira ponto de partida quando a IA comeca a falar", () => {
  const guard = createBargeInGuard();
  // Sala barulhenta (ventilador, conversa longe) enquanto a IA esta calada.
  for (let index = 0; index < 200; index += 1) guard.process(tone(0.012, index), false);
  for (let index = 0; index < 60; index += 1) {
    assert.ok(isSilent(guard.process(tone(0.03, index), true)), `quadro ${index}`);
  }
});

test("reset fecha a interrupcao", () => {
  const guard = trainedGuard();
  for (let index = 0; index < 12; index += 1) guard.process(tone(0.09, index), true);
  guard.reset();
  assert.ok(isSilent(guard.process(tone(0.002), true)));
});

test("destravar: microfone quieto 2,5 s depois do inicio da fala, sem o fim, pede audioStreamEnd", () => {
  const watch = createStallWatch();
  watch.started();
  for (let index = 0; index < 60; index += 1) assert.equal(watch.frame(0.1, 0.1), false);
  const fired: number[] = [];
  for (let index = 0; index < 200; index += 1) if (watch.frame(0.003, 0.1)) fired.push(index);
  assert.deepEqual(fired, [124], "uma vez so, no 125o quadro quieto");
});

test("destravar: fala que continua, ou fim marcado pelo servidor, nao destrava", () => {
  const talking = createStallWatch();
  talking.started();
  for (let index = 0; index < 400; index += 1) {
    assert.equal(talking.frame(index % 100 < 90 ? 0.003 : 0.1, 0.1), false, `quadro ${index}`);
  }

  const ended = createStallWatch();
  ended.started();
  ended.ended();
  for (let index = 0; index < 400; index += 1) assert.equal(ended.frame(0.003, 0.1), false);

  const neverStarted = createStallWatch();
  for (let index = 0; index < 400; index += 1) assert.equal(neverStarted.frame(0.003, 0.1), false);
});

test("destravar: conversa ao fundo bem abaixo do usuario conta como quieto", () => {
  const watch = createStallWatch();
  watch.started();
  let fired = false;
  for (let index = 0; index < 130; index += 1) fired = watch.frame(0.012, 0.1) || fired;
  assert.ok(fired);
});
