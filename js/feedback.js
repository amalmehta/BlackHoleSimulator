/*
 * Black Hole Simulator — feedback tab.
 *
 * Notes are kept in this browser only (localStorage). Nothing is sent
 * anywhere; the reader can download or copy them to pass along.
 */
(function (root) {
  'use strict';

  const KEY = 'blackHoleSimulator.feedback.v1';

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const write = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* ignore */ } };

  function asText(list) {
    return list.map((n) => `[${n.at}] ${n.text}`).join('\n\n') + '\n';
  }

  function init() {
    const tab = document.getElementById('feedback-tab');
    const panel = document.getElementById('feedback-panel');
    const text = panel.querySelector('textarea');
    const status = panel.querySelector('.feedback-status');

    const refresh = () => {
      const n = read().length;
      status.textContent = n ? `${n} note${n === 1 ? '' : 's'} saved in this browser.` : 'Notes stay in this browser until you download them.';
      panel.querySelector('[data-action="download"]').disabled = !n;
      panel.querySelector('[data-action="copy"]').disabled = !n;
    };

    tab.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) { refresh(); text.focus(); }
    });
    panel.querySelector('[data-action="close"]').addEventListener('click', () => { panel.hidden = true; });

    panel.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const t = text.value.trim();
      if (!t) return;
      const list = read();
      list.push({ at: new Date().toISOString(), text: t });
      write(list);
      text.value = '';
      refresh();
      status.textContent = 'Saved. Thank you!';
    });

    panel.querySelector('[data-action="download"]').addEventListener('click', () => {
      const blob = new Blob([asText(read())], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'Black Hole Simulator feedback.txt';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    panel.querySelector('[data-action="copy"]').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(asText(read())); status.textContent = 'Copied to clipboard.'; }
      catch (e) { status.textContent = 'Copy failed — use Download instead.'; }
    });

    refresh();
  }

  root.Feedback = { init };
})(typeof globalThis !== 'undefined' ? globalThis : this);
