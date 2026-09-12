#!/usr/bin/env node
/**
 * Premiere Pro FCP7 XML (.xml)
 * VO clips only; AROLL slots and breath are empty timeline GAPS (no silence media).
 * Usage: node export_xmeml.js <assemble_plan.json> <out.xml>
 */
const fs = require('fs');
const path = require('path');

const planPath = process.argv[2];
const outPath = process.argv[3];
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

const timebase = 30; // ntsc TRUE => 29.97
const wav = plan.source.original_wav || plan.source.audio_mp3;
const breath = (plan.rules && plan.rules.breath_sec) || 0.1;
const defaultAroll = (plan.rules && plan.rules.aroll_silence_sec) || 5;

function secToFrames(sec) {
  return Math.max(0, Math.round(Number(sec) * 30000 / 1001));
}
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/[\u201c\u201d]/g, '');
}
function fileUri(p) {
  let norm = path.resolve(p).replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(norm)) {
    const drive = norm[0].toUpperCase();
    const rest = norm.slice(2);
    return 'file://localhost/' + drive + '%3a' + rest.split('/').map(encodeURIComponent).join('/');
  }
  return 'file://localhost' + norm.split('/').map(encodeURIComponent).join('/');
}

const wavDurFrames = secToFrames(1187.6865);
let timelineFrame = 0;
const clips = [];
let fileDefined = false;
let gapCount = 0;
let gapFramesTotal = 0;

function pushGap(sec, reason) {
  const g = secToFrames(sec);
  if (g <= 0) return;
  timelineFrame += g;
  gapCount += 1;
  gapFramesTotal += g;
}

function pushVoClip(name, inF, outF) {
  const dur = Math.max(1, outF - inF);
  const start = timelineFrame;
  const end = timelineFrame + dur;
  timelineFrame = end;
  const id = 'clipitem-' + (clips.length + 1);

  let fileXml;
  if (!fileDefined) {
    fileXml = [
      '<file id="file-vo">',
      '<name>' + esc(path.basename(wav)) + '</name>',
      '<pathurl>' + fileUri(wav) + '</pathurl>',
      '<rate><timebase>' + timebase + '</timebase><ntsc>TRUE</ntsc></rate>',
      '<duration>' + wavDurFrames + '</duration>',
      '<timecode><rate><timebase>' + timebase + '</timebase><ntsc>TRUE</ntsc></rate><string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>',
      '<media><audio>',
      '<samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics>',
      '<channelcount>2</channelcount>',
      '</audio></media>',
      '</file>',
    ].join('');
    fileDefined = true;
  } else {
    fileXml = '<file id="file-vo"/>';
  }

  clips.push([
    '<clipitem id="' + id + '">',
    '<name>' + esc(name) + '</name>',
    '<enabled>TRUE</enabled>',
    '<duration>' + wavDurFrames + '</duration>',
    '<rate><timebase>' + timebase + '</timebase><ntsc>TRUE</ntsc></rate>',
    '<start>' + start + '</start>',
    '<end>' + end + '</end>',
    '<in>' + inF + '</in>',
    '<out>' + outF + '</out>',
    fileXml,
    '<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>',
    '</clipitem>',
  ].join(''));
}

for (const item of plan.timeline) {
  if (item.type === 'vo') {
    const inF = secToFrames(item.src_start);
    const outF = secToFrames(item.src_end);
    pushVoClip('VO ' + (item.script_text || item.text || 'VO').slice(0, 48), inF, outF);
    // small editable gap after each VO (not silence media)
    if (breath > 0) pushGap(breath, 'breath');
  } else if (item.type === 'aroll_slot') {
    pushGap(item.duration || defaultAroll, 'aroll');
  }
}

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<!DOCTYPE xmeml>',
  '<xmeml version="5">',
  '<sequence id="sequence-1">',
  '<name>AROLL-StageB</name>',
  '<duration>' + timelineFrame + '</duration>',
  '<rate><timebase>' + timebase + '</timebase><ntsc>TRUE</ntsc></rate>',
  '<timecode><rate><timebase>' + timebase + '</timebase><ntsc>TRUE</ntsc></rate><string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>',
  '<media>',
  '<video>',
  '<format><samplecharacteristics>',
  '<rate><timebase>' + timebase + '</timebase><ntsc>TRUE</ntsc></rate>',
  '<width>1920</width><height>1080</height>',
  '<pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance>',
  '</samplecharacteristics></format>',
  '<track><enabled>TRUE</enabled><locked>FALSE</locked></track>',
  '</video>',
  '<audio>',
  '<numOutputChannels>2</numOutputChannels>',
  '<format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>',
  '<outputs>',
  '<group><index>1</index><numchannels>1</numchannels><downmix>0</downmix><channel><index>1</index></channel></group>',
  '<group><index>2</index><numchannels>1</numchannels><downmix>0</downmix><channel><index>2</index></channel></group>',
  '</outputs>',
  '<track>',
  clips.join('\n'),
  '<enabled>TRUE</enabled><locked>FALSE</locked>',
  '</track>',
  '</audio>',
  '</media>',
  '</sequence>',
  '</xmeml>',
].join('\n');

fs.writeFileSync(outPath, xml, 'utf8');
console.log(JSON.stringify({
  out: outPath,
  vo_clips: clips.length,
  gaps: gapCount,
  gap_sec: Number(((gapFramesTotal * 1001) / 30000).toFixed(2)),
  duration_sec: Number(((timelineFrame * 1001) / 30000).toFixed(2)),
  silence_media: false,
  wav,
}));
