#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const METHOD_KEYS = [
  'dcf20Year',
  'dfcf20Year',
  'dni20Year',
  'dfcfTerminal',
  'meanPSValue',
  'meanPEValue',
  'meanPBValue',
  'psgValue',
  'pegValue',
];

const DEFAULT_SAMPLE_PATH = path.join(__dirname, 'oracle-reference-samples.json');

const defaultConfig = {
  methodWeights: {
    dcf20Year: 0.134145,
    dfcf20Year: 0.0237,
    dni20Year: 0.527679,
    dfcfTerminal: 0.314476,
    meanPSValue: 0.075361,
    meanPEValue: 0.34527,
    meanPBValue: 0.334838,
    psgValue: 0.22069,
    pegValue: 0.023841,
  },
  dcfBlendWeight: 0.400104,
  relativeBlendWeight: 0.599896,
  medianAnchorWeight: 0.00453,
  priceAnchorBase: 0.042984,
  priceAnchorSpread: 0.386538,
  priceAnchorMax: 0.35,
};

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function weightedMean(methods, weights) {
  let sum = 0;
  let wsum = 0;
  for (const key of Object.keys(weights)) {
    const value = methods?.[key];
    const weight = weights[key];
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(weight) || weight <= 0) continue;
    sum += value * weight;
    wsum += weight;
  }
  return wsum > 0 ? sum / wsum : null;
}

function predict(sample, config) {
  const dcfWeights = {
    dcf20Year: config.methodWeights.dcf20Year,
    dfcf20Year: config.methodWeights.dfcf20Year,
    dni20Year: config.methodWeights.dni20Year,
    dfcfTerminal: config.methodWeights.dfcfTerminal,
  };
  const relativeWeights = {
    meanPSValue: config.methodWeights.meanPSValue,
    meanPEValue: config.methodWeights.meanPEValue,
    meanPBValue: config.methodWeights.meanPBValue,
    psgValue: config.methodWeights.psgValue,
    pegValue: config.methodWeights.pegValue,
  };

  const dcfBucketFair = weightedMean(sample.methods, dcfWeights);
  const relativeBucketFair = weightedMean(sample.methods, relativeWeights);
  const blendedBucketFair = dcfBucketFair && relativeBucketFair
    ? (dcfBucketFair * config.dcfBlendWeight) + (relativeBucketFair * config.relativeBlendWeight)
    : (dcfBucketFair || relativeBucketFair);
  if (!blendedBucketFair) return null;

  const methodValues = METHOD_KEYS
    .map((k) => sample.methods?.[k])
    .filter((v) => Number.isFinite(v) && v > 0);
  const med = median(methodValues);
  const withMedianAnchor = med
    ? (blendedBucketFair * (1 - config.medianAnchorWeight)) + (med * config.medianAnchorWeight)
    : blendedBucketFair;

  const spread = dcfBucketFair && relativeBucketFair
    ? Math.abs(Math.log((dcfBucketFair + 1) / (relativeBucketFair + 1)))
    : 0;
  const priceAnchor = Math.min(config.priceAnchorMax, config.priceAnchorBase + (config.priceAnchorSpread * spread));
  const fair = (withMedianAnchor * (1 - priceAnchor)) + (sample.price * priceAnchor);

  return {
    fair,
    dcfBucketFair,
    relativeBucketFair,
    blendedBucketFair,
    median: med,
    spread,
    priceAnchor,
  };
}

function evaluate(samples, config) {
  let sumApe = 0;
  const rows = [];
  for (const sample of samples) {
    const result = predict(sample, config);
    if (!result || !Number.isFinite(result.fair) || !Number.isFinite(sample.target) || sample.target <= 0) continue;
    const ape = Math.abs((result.fair - sample.target) / sample.target);
    sumApe += ape;
    rows.push({
      id: sample.id,
      target: sample.target,
      fair: result.fair,
      accuracy: (1 - ape) * 100,
      ape,
    });
  }
  const mape = rows.length ? (sumApe / rows.length) : null;
  return { rows, mape, accuracy: mape === null ? null : (1 - mape) * 100 };
}

function randomSimplex(n) {
  const raw = Array.from({ length: n }, () => Math.random());
  const sum = raw.reduce((a, b) => a + b, 0);
  return raw.map((x) => x / sum);
}

function fit(samples, iterations = 250000) {
  const keys = METHOD_KEYS;
  let best = { loss: Number.POSITIVE_INFINITY, config: null };
  for (let i = 0; i < iterations; i++) {
    const w = randomSimplex(keys.length);
    const mix = randomSimplex(3);
    const candidate = {
      methodWeights: Object.fromEntries(keys.map((k, idx) => [k, w[idx]])),
      dcfBlendWeight: mix[0],
      relativeBlendWeight: mix[1],
      medianAnchorWeight: mix[2] * 0.05,
      priceAnchorBase: Math.random() * 0.1,
      priceAnchorSpread: Math.random() * 0.5,
      priceAnchorMax: 0.35,
    };
    const { mape } = evaluate(samples, candidate);
    if (Number.isFinite(mape) && mape < best.loss) {
      best = { loss: mape, config: candidate };
    }
  }
  return best;
}

function loadSamples(samplePath) {
  const abs = path.isAbsolute(samplePath) ? samplePath : path.join(process.cwd(), samplePath);
  const raw = fs.readFileSync(abs, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Sample file must be a JSON array');
  return parsed;
}

function main() {
  const args = process.argv.slice(2);
  const sampleArgIndex = args.indexOf('--samples');
  const fitArgIndex = args.indexOf('--fit');
  const iterArgIndex = args.indexOf('--iterations');

  const samplePath = sampleArgIndex >= 0 ? args[sampleArgIndex + 1] : DEFAULT_SAMPLE_PATH;
  const samples = loadSamples(samplePath);

  const runFit = fitArgIndex >= 0;
  const iterations = iterArgIndex >= 0 ? Number(args[iterArgIndex + 1]) : 250000;

  if (runFit) {
    const best = fit(samples, Number.isFinite(iterations) ? iterations : 250000);
    console.log('Best fit MAPE:', best.loss.toFixed(6), 'Accuracy:', ((1 - best.loss) * 100).toFixed(2) + '%');
    console.log('Best fit config:');
    console.log(JSON.stringify(best.config, null, 2));
  }

  const { rows, mape, accuracy } = evaluate(samples, defaultConfig);
  console.log('\nOracle Approx Evaluation (current config)');
  for (const row of rows) {
    console.log(
      `${row.id.padEnd(10)} target=${row.target.toFixed(2)} predicted=${row.fair.toFixed(2)} accuracy=${row.accuracy.toFixed(1)}%`
    );
  }
  if (Number.isFinite(mape)) {
    console.log(`\nMAPE=${mape.toFixed(6)} | Accuracy=${accuracy.toFixed(2)}%`);
  }
}

main();
