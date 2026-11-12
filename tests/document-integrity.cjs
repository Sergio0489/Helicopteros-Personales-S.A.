'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');

test('the application document starts with its doctype and contains no truncated tool output',()=>{
 assert.match(html,/^\s*<!doctype html>/i);
 assert.doesNotMatch(html,/Warning:\s*truncated output|tokens truncated|Total output lines:/i);
 assert.match(html,/<\/body>\s*<\/html>\s*$/i);
});

test('the application keeps its complete head, inline styles, and registration cache version',()=>{
 const head=html.match(/<head>([\s\S]*?)<\/head>/i);
 assert(head,'Document head must be complete');
 const styles=[...head[1].matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
 assert(styles.length>0,'Application styles must be inside the head');
 assert.equal((head[1].match(/<style\b/gi)||[]).length,styles.length,'Every style block must close');
 assert.match(styles[0][1],/:root\s*\{/);
 assert.match(styles[0][1],/--bg:\s*#cfd8e3/);
 assert.match(head[1],/<link\b[^>]*rel="manifest"[^>]*>/i);
 assert.match(html,/<script src="registration\.js\?v=identity-review-20261111"><\/script>/);
});
