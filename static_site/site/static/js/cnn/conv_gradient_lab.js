(() => {
  'use strict';

  const X = [
    [1.00, 0.20, -0.50, 0.70],
    [0.30, 1.20, 0.00, -0.20],
    [0.80, -0.40, 0.60, 1.10],
    [-0.10, 0.50, 0.90, -0.30]
  ];

  const K = [
    [0.25, -0.10, 0.35],
    [0.40, 0.15, -0.20],
    [-0.30, 0.50, 0.10]
  ];

  const BIAS = 0.05;
  const LR = 0.10;
  const dZ = [
    [0.42, -0.18],
    [0.31, 0.27]
  ];

  const state = {
    mode: 'forward',
    stepQueue: [],
    stepIndex: 0,
    isPlaying: false,
    speed: 1,
    Z: zeros(2, 2),
    product: zeros(3, 3),
    dK: zeros(3, 3),
    dX: zeros(4, 4),
    db: 0,
    updatedK: zeros(3, 3),
    updatedB: BIAS,
    currentPatch: null,
    currentOutput: null,
    accumulatedForwardSum: 0,
    pauseRequested: false
  };

  const el = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    renderAllMatrices();
    bindEvents();
    setMode('forward');
  }

  function cacheElements() {
    el.stage = document.getElementById('stageCard');
    el.animLayer = document.getElementById('animLayer');
    el.arrowLayer = document.getElementById('arrowLayer');
    el.stepTitle = document.getElementById('stepTitle');
    el.formulaText = document.getElementById('formulaText');
    el.substitutionText = document.getElementById('substitutionText');
    el.conclusionText = document.getElementById('conclusionText');
    el.stepCounter = document.getElementById('stepCounter');
    el.stepBtn = document.getElementById('stepBtn');
    el.autoBtn = document.getElementById('autoBtn');
    el.pauseBtn = document.getElementById('pauseBtn');
    el.resetBtn = document.getElementById('resetBtn');
    el.speedSelect = document.getElementById('speedSelect');
    el.sumBox = document.getElementById('sumBox');
    el.dbBox = document.getElementById('dbBox');
  }

  function bindEvents() {
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    el.stepBtn.addEventListener('click', runSingleStep);
    el.autoBtn.addEventListener('click', autoPlay);
    el.pauseBtn.addEventListener('click', pauseAutoPlay);
    el.resetBtn.addEventListener('click', () => resetMode(true));
    el.speedSelect.addEventListener('change', () => {
      state.speed = Number(el.speedSelect.value) || 1;
    });
  }

  function setMode(mode) {
    state.mode = mode;
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    resetMode(false);
    if (mode === 'forward') {
      state.stepQueue = buildForwardSteps();
      updateStepCard({
        title: 'Forward 准备开始',
        formula: 'Z[i,j] = \\sum X[i+u,j+v] \\cdot K[u,v] + b',
        substitution: '点击“单步”后，将从 Z[0,0] 开始展示 patch、kernel、逐格乘法、求和与写入输出。',
        conclusion: 'Forward 演示用于建立卷积局部感受野和逐元素乘加的直观对应。'
      });
    } else if (mode === 'backward') {
      state.stepQueue = buildBackwardSteps();
      updateStepCard({
        title: 'Backward 准备开始',
        formula: 'dK \\mathrel{+}= X_{\\text{patch}} \\cdot dZ, \\quad db \\mathrel{+}= dZ, \\quad dX_{\\text{patch}} \\mathrel{+}= K \\cdot dZ',
        substitution: '点击“单步”后，将从 dZ[0,0] 开始，分三条路径计算 dK、db 和 dX。',
        conclusion: 'Backward 演示重点观察 dK 与 dX 的累加，尤其是 dX 重叠区域的 scatter-add。'
      });
    } else {
      state.stepQueue = buildUpdateSteps();
      updateStepCard({
        title: 'Update 准备开始',
        formula: 'K_{\\text{new}} = K_{\\text{old}} - \\mathrm{lr} \\cdot dK, \\quad b_{\\text{new}} = b_{\\text{old}} - \\mathrm{lr} \\cdot db',
        substitution: 'Update 会先确保 dK/db 已经由 backward 完成，再逐格展示参数更新。',
        conclusion: 'K 和 b 是可学习参数；dX 不是参数，只用于继续向上一层传播。'
      });
    }
    updateCounter();
  }

  function resetMode(clearCard) {
    pauseAutoPlay();
    clearAnimationLayer();
    clearHighlights();
    clearArrows();
    state.stepIndex = 0;
    state.Z = zeros(2, 2);
    state.product = zeros(3, 3);
    state.dK = zeros(3, 3);
    state.dX = zeros(4, 4);
    state.db = 0;
    state.updatedK = cloneMatrix(K);
    state.updatedB = BIAS;
    state.currentPatch = null;
    state.currentOutput = null;
    state.accumulatedForwardSum = 0;
    renderAllMatrices();
    if (clearCard) {
      updateStepCard({
        title: '已重置',
        formula: '请选择模式并开始演示。',
        substitution: '所有矩阵已恢复到初始状态。',
        conclusion: '单步执行时，每次只推进一个可观察的小运算。'
      });
    }
    updateCounter();
  }

  async function runSingleStep() {
    if (state.isPlaying) return;
    if (state.stepIndex >= state.stepQueue.length) {
      updateStepCard({
        title: '当前模式已播放完成',
        formula: '点击“重置”可以重新开始。',
        substitution: '也可以切换 Forward / Backward / Update 重新生成步骤队列。',
        conclusion: '完成后保留最终矩阵，便于录屏讲解。'
      });
      return;
    }
    state.isPlaying = true;
    toggleControls(true);
    try {
      const step = state.stepQueue[state.stepIndex];
      await executeStep(step);
      state.stepIndex += 1;
      updateCounter();
    } finally {
      state.isPlaying = false;
      toggleControls(false);
    }
  }

  async function autoPlay() {
    if (state.isPlaying) return;
    state.pauseRequested = false;
    state.isPlaying = true;
    toggleControls(true);
    try {
      while (state.stepIndex < state.stepQueue.length && !state.pauseRequested) {
        const step = state.stepQueue[state.stepIndex];
        await executeStep(step);
        state.stepIndex += 1;
        updateCounter();
        await wait(220);
      }
    } finally {
      state.isPlaying = false;
      state.pauseRequested = false;
      toggleControls(false);
    }
  }

  function pauseAutoPlay() {
    state.pauseRequested = true;
  }

  function toggleControls(running) {
    el.stepBtn.disabled = running;
    el.autoBtn.disabled = running;
  }

  function buildForwardSteps() {
    const steps = [];
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        steps.push({ type: 'forward-select', i, j });
        steps.push({ type: 'kernel-cover', i, j, mode: 'forward' });
        for (let u = 0; u < 3; u += 1) {
          for (let v = 0; v < 3; v += 1) {
            steps.push({ type: 'forward-multiply', i, j, u, v });
          }
        }
        steps.push({ type: 'forward-sum', i, j });
        steps.push({ type: 'forward-write', i, j });
      }
    }
    return steps;
  }

  function buildBackwardSteps() {
    const steps = [];
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        steps.push({ type: 'backward-select-dz', i, j });
        for (let u = 0; u < 3; u += 1) {
          for (let v = 0; v < 3; v += 1) {
            steps.push({ type: 'backward-dk', i, j, u, v });
          }
        }
        steps.push({ type: 'backward-db', i, j });
        steps.push({ type: 'kernel-cover-dx', i, j, mode: 'backward' });
        for (let u = 0; u < 3; u += 1) {
          for (let v = 0; v < 3; v += 1) {
            steps.push({ type: 'backward-dx', i, j, u, v });
          }
        }
      }
    }
    return steps;
  }

  function buildUpdateSteps() {
    const steps = [];
    steps.push({ type: 'prepare-update' });
    for (let u = 0; u < 3; u += 1) {
      for (let v = 0; v < 3; v += 1) {
        steps.push({ type: 'update-k', u, v });
      }
    }
    steps.push({ type: 'update-b' });
    return steps;
  }

  async function executeStep(step) {
    clearArrows();
    clearTransientHighlights();
    switch (step.type) {
      case 'forward-select':
        return forwardSelect(step);
      case 'kernel-cover':
        return kernelCover(step.i, step.j, 'forward', 'x');
      case 'forward-multiply':
        return forwardMultiply(step);
      case 'forward-sum':
        return forwardSum(step);
      case 'forward-write':
        return forwardWrite(step);
      case 'backward-select-dz':
        return backwardSelectDz(step);
      case 'backward-dk':
        return backwardDK(step);
      case 'backward-db':
        return backwardDB(step);
      case 'kernel-cover-dx':
        return kernelCover(step.i, step.j, 'backward', 'dx');
      case 'backward-dx':
        return backwardDX(step);
      case 'prepare-update':
        return prepareUpdate();
      case 'update-k':
        return updateKStep(step);
      case 'update-b':
        return updateBStep(step);
      default:
        return wait(200);
    }
  }

  async function forwardSelect({ i, j }) {
    state.currentPatch = { i, j };
    state.currentOutput = { i, j };
    state.product = zeros(3, 3);
    state.accumulatedForwardSum = 0;
    renderMatrix('product', state.product, { blankZeros: true });
    updateSum(0);
    clearHighlights();
    const zCell = getCell('z', i, j);
    zCell.classList.add('forward-active');
    highlightPatch('x', i, j, 'forward');
    drawArrow(panelCenter('z'), panelCenter('x'), 'forward');
    updateStepCard({
      title: `F：选择输出位置 Z[${i},${j}]`,
      formula: 'Z[i,j] = \\sum X[i+u,j+v] \\cdot K[u,v] + b',
      substitution: `当前输出 Z[${i},${j}] 对应输入窗口 X[${i}:${i + 3}, ${j}:${j + 3}]。`,
      conclusion: '输出矩阵中的一个格子只依赖输入矩阵中的一个局部 patch。'
    });
    await wait(650);
  }

  async function kernelCover(i, j, mode, targetMatrix) {
    const targetCells = [];
    for (let u = 0; u < 3; u += 1) {
      for (let v = 0; v < 3; v += 1) {
        const matrix = targetMatrix === 'dx' ? 'dx' : 'x';
        targetCells.push(getCell(matrix, i + u, j + v));
      }
    }
    const from = getPanelRect('k');
    const to = boundingBoxForCells(targetCells);
    const ghost = createKernelGhost(mode);
    const start = relativePoint(from.left + from.width / 2, from.top + from.height / 2);
    const end = relativePoint(to.left + to.width / 2, to.top + to.height / 2);
    ghost.style.left = `${start.x}px`;
    ghost.style.top = `${start.y}px`;
    ghost.style.transform = 'translate(-50%, -50%) scale(0.75)';
    el.animLayer.appendChild(ghost);
    drawArrow(start, end, mode);
    await animateElement(ghost, [
      { transform: 'translate(-50%, -50%) scale(0.75)', opacity: 0.15 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, left: `${end.x}px`, top: `${end.y}px` }
    ], 760);
    updateStepCard({
      title: mode === 'forward' ? 'F：卷积核移动覆盖输入窗口' : 'B：卷积核对齐 dX 回传区域',
      formula: mode === 'forward' ? 'K[u,v] \\text{ 与 } X[i+u,j+v] \\text{ 对齐 }' : 'dX[i+u,j+v] \\mathrel{+}= K[u,v] \\cdot dZ[i,j]',
      substitution: mode === 'forward'
        ? `K 的 3×3 副本移动到 X[${i}:${i + 3}, ${j}:${j + 3}] 上方。`
        : `K 的 3×3 副本移动到 dX[${i}:${i + 3}, ${j}:${j + 3}] 上方。`,
      conclusion: mode === 'forward'
        ? '卷积核的每个权重会与输入窗口同位置的像素相乘。'
        : '当前 dZ 会通过卷积核权重分配回输入梯度 dX 的对应区域。'
    });
    await wait(280);
    ghost.remove();
  }

  async function forwardMultiply({ i, j, u, v }) {
    const xVal = X[i + u][j + v];
    const kVal = K[u][v];
    const product = xVal * kVal;
    const xCell = getCell('x', i + u, j + v);
    const kCell = getCell('k', u, v);
    const pCell = getCell('product', u, v);
    xCell.classList.add('forward-active');
    kCell.classList.add('forward-active');
    const node = await showOperationNodeBetween(xCell, kCell, '×', 'forward');
    await Promise.all([
      flyValue(xCell, node, fmt(xVal), 'forward'),
      flyValue(kCell, node, fmt(kVal), 'forward')
    ]);
    await wait(120);
    await flyValue(node, pCell, fmt(product), 'forward');
    state.product[u][v] = product;
    renderMatrix('product', state.product, { blankZeros: true });
    getCell('product', u, v).classList.add('write-pulse', 'forward-active');
    updateStepCard({
      title: `F：逐格乘法 product[${u},${v}]`,
      formula: '\\mathrm{product}[u,v] = X[i+u,j+v] \\cdot K[u,v]',
      substitution: `product[${u},${v}] = X[${i + u},${j + v}] × K[${u},${v}] = ${fmt(xVal)} × ${fmt(kVal)} = ${fmt(product)}`,
      conclusion: '每个输入值只与卷积核同位置权重相乘，形成 Product Matrix 的一个格子。'
    });
    await wait(280);
    node.remove();
  }

  async function forwardSum({ i, j }) {
    const productCells = allCells('product');
    let sum = 0;
    updateStepCard({
      title: `F：求和并加入 bias`,
      formula: 'Z[i,j] = \\sum \\mathrm{product}[u,v] + b',
      substitution: '9 个 product 依次飞入 Σ 求和器，随后 bias b 也加入求和器。',
      conclusion: '卷积输出值等于逐元素乘积之和再加上偏置。'
    });
    for (let idx = 0; idx < productCells.length; idx += 1) {
      const u = Math.floor(idx / 3);
      const v = idx % 3;
      const value = state.product[u][v];
      sum += value;
      await flyValue(productCells[idx], el.sumBox, fmt(value), 'forward');
      updateSum(sum);
      await wait(70);
    }
    await flyValue(document.getElementById('biasBox'), el.sumBox, fmt(BIAS), 'forward');
    sum += BIAS;
    state.accumulatedForwardSum = sum;
    updateSum(sum);
    updateStepCard({
      title: `F：得到 Z[${i},${j}] 的数值`,
      formula: 'Z[i,j] = \\sum \\mathrm{product}[u,v] + b',
      substitution: `Z[${i},${j}] = ${fmt(sum - BIAS)} + ${fmt(BIAS)} = ${fmt(sum)}`,
      conclusion: '得到的数值会写入当前输出位置。'
    });
    await wait(450);
  }

  async function forwardWrite({ i, j }) {
    const zCell = getCell('z', i, j);
    await flyValue(el.sumBox, zCell, fmt(state.accumulatedForwardSum), 'forward');
    state.Z[i][j] = state.accumulatedForwardSum;
    renderMatrix('z', state.Z, { blankZeros: true });
    zCell.classList.add('write-pulse', 'forward-active');
    updateStepCard({
      title: `F：写入输出 Z[${i},${j}]`,
      formula: 'Z[i,j] \\leftarrow \\sum X_{\\text{patch}} \\cdot K + b',
      substitution: `Z[${i},${j}] 写入 ${fmt(state.Z[i][j])}。`,
      conclusion: '一个输出位置的 forward 计算完成；滑动窗口将继续计算下一个输出位置。'
    });
    await wait(520);
  }

  async function backwardSelectDz({ i, j }) {
    clearHighlights();
    const dzCell = getCell('dz', i, j);
    dzCell.classList.add('backward-active');
    highlightPatch('x', i, j, 'backward');
    drawArrowBetween(dzCell, getPanelElement('dk'), 'backward');
    drawArrowBetween(dzCell, el.dbBox, 'backward');
    drawArrowBetween(dzCell, getPanelElement('dx'), 'backward');
    updateStepCard({
      title: `B：选择上游梯度 dZ[${i},${j}]`,
      formula: 'dZ[i,j] \\rightarrow dK, \\; db, \\; dX',
      substitution: `当前 dZ[${i},${j}] = ${fmt(dZ[i][j])}。`,
      conclusion: '卷积层反向传播会同时计算参数梯度和传回上一层的输入梯度。'
    });
    await pulseSplit(dzCell);
    await wait(360);
  }

  async function backwardDK({ i, j, u, v }) {
    const dzVal = dZ[i][j];
    const xVal = X[i + u][j + v];
    const contribution = xVal * dzVal;
    const oldVal = state.dK[u][v];
    const newVal = oldVal + contribution;
    const xCell = getCell('x', i + u, j + v);
    const dzCell = getCell('dz', i, j);
    const dkCell = getCell('dk', u, v);
    xCell.classList.add('backward-active');
    dzCell.classList.add('backward-active');
    dkCell.classList.add('backward-active');
    const node = await showOperationNodeBetween(xCell, dzCell, '×', 'backward');
    await Promise.all([
      flyValue(xCell, node, fmt(xVal), 'backward'),
      flyValue(dzCell, node, fmt(dzVal), 'backward')
    ]);
    await wait(100);
    await flyValue(node, dkCell, fmt(contribution), 'backward');
    await showBubble(dkCell, `${fmt(oldVal)} + ${fmt(contribution)} = ${fmt(newVal)}`, 'backward');
    state.dK[u][v] = newVal;
    renderMatrix('dk', state.dK, { heat: true });
    getCell('dk', u, v).classList.add('accum-pulse', 'backward-active');
    updateStepCard({
      title: `B：累加卷积核梯度 dK[${u},${v}]`,
      formula: 'dK[u,v] \\mathrel{+}= X[i+u,j+v] \\cdot dZ[i,j]',
      substitution: `dK[${u},${v}] += X[${i + u},${j + v}] × dZ[${i},${j}] = ${fmt(xVal)} × ${fmt(dzVal)} = ${fmt(contribution)}；新值 ${fmt(oldVal)} + ${fmt(contribution)} = ${fmt(newVal)}。`,
      conclusion: '卷积核梯度来自输入 patch 与当前上游梯度的逐位置乘积。'
    });
    await wait(260);
    node.remove();
  }

  async function backwardDB({ i, j }) {
    const dzVal = dZ[i][j];
    const oldVal = state.db;
    const newVal = oldVal + dzVal;
    const dzCell = getCell('dz', i, j);
    dzCell.classList.add('backward-active');
    el.dbBox.classList.add('backward-active');
    drawArrowBetween(dzCell, el.dbBox, 'backward');
    await flyValue(dzCell, el.dbBox, fmt(dzVal), 'backward');
    await showBubble(el.dbBox, `${fmt(oldVal)} + ${fmt(dzVal)} = ${fmt(newVal)}`, 'backward');
    state.db = newVal;
    updateDB(newVal);
    updateStepCard({
      title: `B：累加偏置梯度 db`,
      formula: 'db \\mathrel{+}= dZ[i,j]',
      substitution: `db += dZ[${i},${j}] = ${fmt(dzVal)}；新值 ${fmt(oldVal)} + ${fmt(dzVal)} = ${fmt(newVal)}。`,
      conclusion: 'bias 对每个输出位置的导数为 1，因此 db 直接累加上游梯度。'
    });
    await wait(480);
  }

  async function backwardDX({ i, j, u, v }) {
    const dzVal = dZ[i][j];
    const kVal = K[u][v];
    const contribution = kVal * dzVal;
    const xRow = i + u;
    const xCol = j + v;
    const oldVal = state.dX[xRow][xCol];
    const newVal = oldVal + contribution;
    const kCell = getCell('k', u, v);
    const dzCell = getCell('dz', i, j);
    const dxCell = getCell('dx', xRow, xCol);
    kCell.classList.add('backward-active');
    dzCell.classList.add('backward-active');
    dxCell.classList.add('backward-active');
    const node = await showOperationNodeBetween(kCell, dzCell, '×', 'backward');
    await Promise.all([
      flyValue(kCell, node, fmt(kVal), 'backward'),
      flyValue(dzCell, node, fmt(dzVal), 'backward')
    ]);
    await wait(100);
    await flyValue(node, dxCell, fmt(contribution), 'backward');
    await showBubble(dxCell, `${fmt(oldVal)} + ${fmt(contribution)} = ${fmt(newVal)}`, 'backward');
    state.dX[xRow][xCol] = newVal;
    renderMatrix('dx', state.dX, { heat: true });
    getCell('dx', xRow, xCol).classList.add('accum-pulse', 'backward-active');
    updateStepCard({
      title: `B：scatter-add 输入梯度 dX[${xRow},${xCol}]`,
      formula: 'dX[i+u,j+v] \\mathrel{+}= K[u,v] \\cdot dZ[i,j]',
      substitution: `dX[${xRow},${xCol}] += K[${u},${v}] × dZ[${i},${j}] = ${fmt(kVal)} × ${fmt(dzVal)} = ${fmt(contribution)}；新值 ${fmt(oldVal)} + ${fmt(contribution)} = ${fmt(newVal)}。`,
      conclusion: oldVal !== 0
        ? '该 dX 位置已经有旧梯度，本次 contribution 会继续累加，展示了卷积反向中的重叠累加。'
        : '当前 dZ 通过卷积核权重把梯度分配回输入区域。'
    });
    await wait(260);
    node.remove();
  }

  async function prepareUpdate() {
    if (matrixAbsSum(state.dK) === 0 && Math.abs(state.db) < 1e-10) {
      computeFullBackwardSilently();
      renderMatrix('dk', state.dK, { heat: true });
      renderMatrix('dx', state.dX, { heat: true });
      updateDB(state.db);
    }
    clearHighlights();
    document.querySelectorAll('[data-matrix="k"] .cell, [data-matrix="dk"] .cell').forEach((cell) => cell.classList.add('update-active'));
    el.dbBox.classList.add('update-active');
    updateStepCard({
      title: 'U：准备执行参数更新',
      formula: 'K_{\\text{new}} = K_{\\text{old}} - \\mathrm{lr} \\cdot dK, \\quad b_{\\text{new}} = b_{\\text{old}} - \\mathrm{lr} \\cdot db',
      substitution: `学习率 lr = ${fmt(LR)}。dK 与 db 已经由 backward 累加得到。`,
      conclusion: '只有 K 和 b 是可学习参数；dX 只继续向上一层传播，不参与本层参数更新。'
    });
    await wait(680);
  }

  async function updateKStep({ u, v }) {
    const oldVal = K[u][v];
    const grad = state.dK[u][v];
    const delta = LR * grad;
    const newVal = oldVal - delta;
    state.updatedK[u][v] = newVal;
    const dkCell = getCell('dk', u, v);
    const kCell = getCell('k', u, v);
    dkCell.classList.add('update-active');
    kCell.classList.add('update-active');
    drawArrowBetween(dkCell, kCell, 'update');
    await flyValue(dkCell, kCell, `lr·dK=${fmt(delta)}`, 'update');
    await showBubble(kCell, `${fmt(oldVal)} - ${fmt(delta)} = ${fmt(newVal)}`, 'update');
    updateKCell(u, v, newVal, true);
    updateStepCard({
      title: `U：更新卷积核 K[${u},${v}]`,
      formula: 'K_{\\text{new}}[u,v] = K_{\\text{old}}[u,v] - \\mathrm{lr} \\cdot dK[u,v]',
      substitution: `K_new[${u},${v}] = ${fmt(oldVal)} - ${fmt(LR)} × ${fmt(grad)} = ${fmt(newVal)}。`,
      conclusion: '橙色梯度乘以学习率后从旧参数中扣除，得到绿色的新参数。'
    });
    await wait(400);
  }

  async function updateBStep() {
    const oldVal = BIAS;
    const grad = state.db;
    const delta = LR * grad;
    const newVal = oldVal - delta;
    state.updatedB = newVal;
    drawArrowBetween(el.dbBox, document.getElementById('biasBox'), 'update');
    await flyValue(el.dbBox, document.getElementById('biasBox'), `lr·db=${fmt(delta)}`, 'update');
    await showBubble(document.getElementById('biasBox'), `${fmt(oldVal)} - ${fmt(delta)} = ${fmt(newVal)}`, 'update');
    document.querySelector('#biasBox strong').textContent = fmt(newVal);
    document.getElementById('biasBox').classList.add('update-active');
    updateStepCard({
      title: 'U：更新偏置 b',
      formula: 'b_{\\text{new}} = b_{\\text{old}} - \\mathrm{lr} \\cdot db',
      substitution: `b_new = ${fmt(oldVal)} - ${fmt(LR)} × ${fmt(grad)} = ${fmt(newVal)}。`,
      conclusion: 'K 与 b 完成参数更新；dX 不更新，它会被继续传给上一层。'
    });
    await wait(650);
  }

  function computeFullBackwardSilently() {
    state.dK = zeros(3, 3);
    state.dX = zeros(4, 4);
    state.db = 0;
    for (let i = 0; i < 2; i += 1) {
      for (let j = 0; j < 2; j += 1) {
        const dzVal = dZ[i][j];
        state.db += dzVal;
        for (let u = 0; u < 3; u += 1) {
          for (let v = 0; v < 3; v += 1) {
            state.dK[u][v] += X[i + u][j + v] * dzVal;
            state.dX[i + u][j + v] += K[u][v] * dzVal;
          }
        }
      }
    }
  }

  function renderAllMatrices() {
    renderMatrix('x', X);
    renderMatrix('k', K);
    renderMatrix('z', state.Z, { blankZeros: true });
    renderMatrix('product', state.product, { blankZeros: true });
    renderMatrix('dz', dZ);
    renderMatrix('dk', state.dK, { blankZeros: true, heat: true });
    renderMatrix('dx', state.dX, { blankZeros: true, heat: true });
    updateSum(0);
    updateDB(state.db);
    document.querySelector('#biasBox strong').textContent = fmt(BIAS);
  }

  function renderMatrix(name, matrix, options = {}) {
    const container = document.querySelector(`[data-matrix="${name}"]`);
    if (!container) return;
    container.innerHTML = '';
    const rows = matrix.length;
    const cols = matrix[0].length;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const value = matrix[r][c];
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.cell = `${name}-${r}-${c}`;
        cell.dataset.row = String(r);
        cell.dataset.col = String(c);
        cell.dataset.value = String(value);
        const label = document.createElement('small');
        label.textContent = `${r},${c}`;
        cell.appendChild(label);
        const text = document.createElement('span');
        const isBlank = options.blankZeros && Math.abs(value) < 1e-10;
        text.textContent = isBlank ? '·' : fmt(value);
        cell.appendChild(text);
        if (isBlank) cell.classList.add('value-empty');
        if (options.heat && Math.abs(value) > 1e-10) {
          cell.classList.add(heatClass(value, matrix));
        }
        container.appendChild(cell);
      }
    }
  }

  function updateKCell(u, v, value, updated) {
    const cell = getCell('k', u, v);
    const span = cell.querySelector('span');
    if (span) span.textContent = fmt(value);
    cell.dataset.value = String(value);
    if (updated) cell.classList.add('update-active', 'write-pulse');
  }

  function updateSum(value) {
    el.sumBox.querySelector('strong').textContent = fmt(value);
  }

  function updateDB(value) {
    el.dbBox.querySelector('strong').textContent = fmt(value);
    el.dbBox.classList.add('write-pulse');
    setTimeout(() => el.dbBox.classList.remove('write-pulse'), 500);
  }

  function updateStepCard({ title, formula, substitution, conclusion }) {
    el.stepTitle.textContent = title || '';
    renderFormula(formula || '');
    el.substitutionText.textContent = substitution || '';
    el.conclusionText.textContent = conclusion || '';
  }

  function renderFormula(formula) {
    if (!el.formulaText) return;
    el.formulaText.innerHTML = '';
    if (!formula) return;

    if (window.katex) {
      try {
        window.katex.render(formula, el.formulaText, {
          displayMode: true,
          throwOnError: false,
          strict: false
        });
        return;
      } catch (error) {
        console.warn("KaTeX render error:", error);
      }
    }
    el.formulaText.textContent = formula;
  }

  function updateCounter() {
    el.stepCounter.textContent = `${state.stepIndex} / ${state.stepQueue.length}`;
  }

  function highlightPatch(matrix, startRow, startCol, mode) {
    for (let u = 0; u < 3; u += 1) {
      for (let v = 0; v < 3; v += 1) {
        const cell = getCell(matrix, startRow + u, startCol + v);
        if (cell) {
          cell.classList.add(matrix === 'x' && mode === 'forward' ? 'patch-cell' : `${mode}-active`);
        }
      }
    }
  }

  function clearHighlights() {
    document.querySelectorAll('.cell, .scalar-box, .sum-box').forEach((node) => {
      node.classList.remove('forward-active', 'backward-active', 'update-active', 'patch-cell', 'muted-cell', 'accum-pulse', 'write-pulse');
    });
  }

  function clearTransientHighlights() {
    document.querySelectorAll('.cell, .scalar-box, .sum-box').forEach((node) => {
      node.classList.remove('forward-active', 'backward-active', 'update-active', 'patch-cell', 'muted-cell', 'accum-pulse', 'write-pulse');
    });
    if (state.mode === 'forward' && state.currentPatch) {
      highlightPatch('x', state.currentPatch.i, state.currentPatch.j, 'forward');
      if (state.currentOutput) getCell('z', state.currentOutput.i, state.currentOutput.j).classList.add('forward-active');
    }
  }

  function clearAnimationLayer() {
    el.animLayer.innerHTML = '';
  }

  function clearArrows() {
    const paths = el.arrowLayer.querySelectorAll('.flow-path');
    paths.forEach((p) => p.remove());
  }

  async function showOperationNodeBetween(sourceA, sourceB, symbol, mode) {
    const a = centerOf(sourceA);
    const b = centerOf(sourceB);
    const node = document.createElement('div');
    node.className = `multiply-node ${mode}`;
    node.textContent = symbol;
    const x = (a.x + b.x) / 2;
    const y = Math.min(a.y, b.y) - 56;
    node.style.left = `${x}px`;
    node.style.top = `${Math.max(42, y)}px`;
    el.animLayer.appendChild(node);
    drawArrow(a, { x, y: Math.max(42, y) }, mode);
    drawArrow(b, { x, y: Math.max(42, y) }, mode);
    await wait(120);
    return node;
  }

  async function flyValue(from, to, text, mode) {
    const start = centerOf(from);
    const end = centerOf(to);
    const chip = document.createElement('div');
    chip.className = `flying-chip ${mode}`;
    chip.textContent = text;
    chip.style.left = `${start.x}px`;
    chip.style.top = `${start.y}px`;
    el.animLayer.appendChild(chip);
    drawArrow(start, end, mode);
    await animateElement(chip, [
      { transform: 'translate(-50%, -50%) scale(0.74)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.15 },
      { left: `${end.x}px`, top: `${end.y}px`, transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.78 },
      { left: `${end.x}px`, top: `${end.y}px`, transform: 'translate(-50%, -50%) scale(0.70)', opacity: 0 }
    ], 620);
    chip.remove();
  }

  async function showBubble(target, text, mode) {
    const pos = centerOf(target);
    const bubble = document.createElement('div');
    bubble.className = `accum-bubble ${mode === 'update' ? 'update' : ''}`;
    bubble.textContent = text;
    bubble.style.left = `${pos.x}px`;
    bubble.style.top = `${pos.y - 24}px`;
    el.animLayer.appendChild(bubble);
    await wait(580);
  }

  async function pulseSplit(cell) {
    const c = centerOf(cell);
    const targets = [getPanelElement('dk'), el.dbBox, getPanelElement('dx')].map(centerOf);
    const chips = targets.map((target) => {
      const chip = document.createElement('div');
      chip.className = 'flying-chip backward';
      chip.textContent = 'dZ';
      chip.style.left = `${c.x}px`;
      chip.style.top = `${c.y}px`;
      el.animLayer.appendChild(chip);
      drawArrow(c, target, 'backward');
      return { chip, target };
    });
    await Promise.all(chips.map(({ chip, target }) => animateElement(chip, [
      { transform: 'translate(-50%, -50%) scale(0.7)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(1.05)', opacity: 1, offset: 0.18 },
      { left: `${target.x}px`, top: `${target.y}px`, opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: 0.78 },
      { left: `${target.x}px`, top: `${target.y}px`, opacity: 0, transform: 'translate(-50%, -50%) scale(0.7)' }
    ], 760).then(() => chip.remove())));
  }

  function createKernelGhost(mode) {
    const ghost = document.createElement('div');
    ghost.className = `kernel-ghost ${mode === 'backward' ? 'backward' : ''} ${mode === 'update' ? 'update' : ''}`;
    for (let u = 0; u < 3; u += 1) {
      for (let v = 0; v < 3; v += 1) {
        const cell = document.createElement('span');
        cell.textContent = fmt(K[u][v]);
        ghost.appendChild(cell);
      }
    }
    return ghost;
  }

  function drawArrowBetween(from, to, mode) {
    drawArrow(centerOf(from), centerOf(to), mode);
  }

  function drawArrow(start, end, mode = 'forward') {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const dx = Math.abs(end.x - start.x);
    const curve = Math.max(40, dx * 0.35);
    const c1x = start.x + (end.x > start.x ? curve : -curve);
    const c2x = end.x - (end.x > start.x ? curve : -curve);
    const d = `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`;
    path.setAttribute('d', d);
    path.setAttribute('class', `flow-path ${mode}`);
    el.arrowLayer.appendChild(path);
    setTimeout(() => path.remove(), 1150 / state.speed + 300);
  }

  function animateElement(element, keyframes, duration) {
    const adjusted = duration / state.speed;
    const animation = element.animate(keyframes, {
      duration: adjusted,
      easing: 'cubic-bezier(.22,.8,.26,1)',
      fill: 'forwards'
    });
    return animation.finished.catch(() => undefined);
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms / state.speed));
  }

  function getCell(matrixName, row, col) {
    return document.querySelector(`[data-cell="${matrixName}-${row}-${col}"]`);
  }

  function allCells(matrixName) {
    return Array.from(document.querySelectorAll(`[data-matrix="${matrixName}"] .cell`));
  }

  function getPanelElement(matrixName) {
    return document.querySelector(`[data-matrix="${matrixName}"]`).closest('.matrix-panel');
  }

  function getPanelRect(matrixName) {
    return getPanelElement(matrixName).getBoundingClientRect();
  }

  function centerOf(target) {
    const rect = target.getBoundingClientRect();
    const root = el.stage.getBoundingClientRect();
    return {
      x: rect.left - root.left + rect.width / 2,
      y: rect.top - root.top + rect.height / 2
    };
  }

  function relativePoint(absX, absY) {
    const root = el.stage.getBoundingClientRect();
    return { x: absX - root.left, y: absY - root.top };
  }

  function panelCenter(matrixName) {
    return centerOf(getPanelElement(matrixName));
  }

  function boundingBoxForCells(cells) {
    const rects = cells.map((cell) => cell.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    return { left, top, width: right - left, height: bottom - top };
  }

  function zeros(rows, cols) {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0));
  }

  function cloneMatrix(matrix) {
    return matrix.map((row) => row.slice());
  }

  function fmt(value) {
    if (!Number.isFinite(value)) return 'NaN';
    const abs = Math.abs(value);
    if (abs < 0.0005) return '0.00';
    return value.toFixed(2);
  }

  function matrixAbsSum(matrix) {
    return matrix.reduce((sum, row) => sum + row.reduce((s, value) => s + Math.abs(value), 0), 0);
  }

  function heatClass(value, matrix) {
    const maxAbs = Math.max(1e-9, ...matrix.flat().map((v) => Math.abs(v)));
    const ratio = Math.min(1, Math.sqrt(Math.abs(value) / maxAbs));
    if (ratio < 0.18) return 'heat-1';
    if (ratio < 0.36) return 'heat-2';
    if (ratio < 0.58) return 'heat-3';
    if (ratio < 0.80) return 'heat-4';
    return 'heat-5';
  }
})();
