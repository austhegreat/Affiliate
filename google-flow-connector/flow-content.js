// SpideyContent AI — Google Flow (labs.google) Content Script
// Injects prompts into Google Flow's editor and displays a floating Multi-Scene Ad Controller HUD.

let currentCampaign = null;
let activeSceneIndex = 0;

function findPromptInput() {
  // Search standard textareas and contenteditable inputs used in Google Labs Flow
  const selectors = [
    'textarea[placeholder*="prompt" i]',
    'textarea[placeholder*="describe" i]',
    'textarea[placeholder*="video" i]',
    'textarea[placeholder*="scene" i]',
    'textarea',
    '[contenteditable="true"][role="textbox"]',
    '[contenteditable="true"]'
  ];

  for (const sel of selectors) {
    const elements = Array.from(document.querySelectorAll(sel));
    const visible = elements.find((el) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 120 && rect.height > 20;
    });
    if (visible) return visible;
  }
  return null;
}

function setReactInputValue(el, text) {
  el.focus();

  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    const prototype =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.isContentEditable) {
    el.innerText = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
  }
}

function findGenerateButton() {
  const buttons = Array.from(document.querySelectorAll("button"));
  return buttons.find((btn) => {
    const text = (btn.innerText || btn.getAttribute("aria-label") || "").toLowerCase();
    return (
      text.includes("generate") ||
      text.includes("create video") ||
      text.includes("make video") ||
      text === "send" ||
      text.includes("submit")
    );
  });
}

function injectPromptIntoFlow(promptText, autoTrigger = false) {
  // Copy to clipboard as reliable backup
  navigator.clipboard?.writeText(promptText).catch(() => {});

  let attempts = 0;
  const maxAttempts = 15;

  const tryInject = () => {
    attempts++;
    const inputEl = findPromptInput();
    if (inputEl) {
      setReactInputValue(inputEl, promptText);
      updateHudStatus("✅ Prompt injected into Google Flow editor! (Also copied to clipboard)");

      if (autoTrigger) {
        setTimeout(() => {
          const genBtn = findGenerateButton();
          if (genBtn && !genBtn.disabled) {
            genBtn.click();
            updateHudStatus("🎬 Triggered Veo video generation in Google Flow!");
          } else {
            updateHudStatus("✅ Prompt filled! Click Generate in Flow to start rendering.");
          }
        }, 500);
      }
      return;
    }

    if (attempts < maxAttempts) {
      setTimeout(tryInject, 700);
    } else {
      updateHudStatus(
        "📋 Prompt copied to clipboard! Click inside the Flow prompt box and press Ctrl+V."
      );
    }
  };

  tryInject();
}

function updateHudStatus(message) {
  const statusEl = document.getElementById("spidey-flow-hud-status");
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function renderSpideyHud(payload) {
  currentCampaign = payload;
  const scenes = payload.scenes || [];
  if (typeof payload.selectedSceneIndex === "number") {
    activeSceneIndex = payload.selectedSceneIndex;
  }

  let hud = document.getElementById("spidey-flow-controller-hud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "spidey-flow-controller-hud";
    hud.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 360px;
      background: #0f172a;
      color: #f8fafc;
      border: 2px solid #ef4444;
      border-radius: 16px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.65);
      font-family: system-ui, -apple-system, sans-serif;
      z-index: 2147483647;
      overflow: hidden;
    `;
    document.body.appendChild(hud);
  }

  const activeScene = scenes[activeSceneIndex] || {
    title: payload.sceneTitle || "Master Ad Clip",
    flowPrompt: payload.prompt || ""
  };

  const sceneButtonsHtml = scenes
    .map(
      (s, idx) => `
      <button data-scene-idx="${idx}" class="spidey-scene-btn" style="
        flex: 1;
        padding: 6px 4px;
        font-size: 11px;
        font-weight: 700;
        border-radius: 8px;
        cursor: pointer;
        border: 1px solid ${idx === activeSceneIndex ? "#ef4444" : "#334155"};
        background: ${idx === activeSceneIndex ? "#dc2626" : "#1e293b"};
        color: #ffffff;
      ">
        S${idx + 1}: ${s.shortLabel || "Clip"}
      </button>
    `
    )
    .join("");

  hud.innerHTML = `
    <div style="background: linear-gradient(90deg, #dc2626, #991b1b); padding: 10px 14px; display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 13px;">
        <span>🕷️ SpideyContent AI — Flow Bridge</span>
      </div>
      <button id="spidey-hud-close" style="background: transparent; border: none; color: white; cursor: pointer; font-size: 16px; line-height: 1;">×</button>
    </div>
    <div style="padding: 12px 14px; display: flex; flex-direction: column; gap: 10px;">
      <div style="font-size: 11px; color: #94a3b8;">
        Product: <strong style="color: #f8fafc;">${payload.productName || "Viral Affiliate Item"}</strong>
      </div>
      ${
        scenes.length > 0
          ? `<div style="display: flex; gap: 6px;">${sceneButtonsHtml}</div>`
          : ""
      }
      <div style="background: #020617; border: 1px solid #1e293b; border-radius: 10px; padding: 8px 10px; font-size: 11px; color: #cbd5e1; max-height: 95px; overflow-y: auto; line-height: 1.4;">
        ${activeScene.flowPrompt}
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="spidey-hud-inject" style="
          flex: 1;
          background: #dc2626;
          color: white;
          border: none;
          padding: 8px 10px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        ">⚡ Fill & Generate in Flow</button>
        <button id="spidey-hud-copy" style="
          background: #1e293b;
          color: #e2e8f0;
          border: 1px solid #334155;
          padding: 8px 10px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        ">📋 Copy</button>
      </div>
      <div id="spidey-flow-hud-status" style="font-size: 11px; color: #34d399; font-weight: 500;">
        Ready — connected to your Google Flow session.
      </div>
    </div>
  `;

  hud.querySelector("#spidey-hud-close")?.addEventListener("click", () => {
    hud.remove();
  });

  hud.querySelector("#spidey-hud-inject")?.addEventListener("click", () => {
    injectPromptIntoFlow(activeScene.flowPrompt, true);
  });

  hud.querySelector("#spidey-hud-copy")?.addEventListener("click", () => {
    navigator.clipboard.writeText(activeScene.flowPrompt);
    updateHudStatus("📋 Copied scene prompt to clipboard!");
  });

  hud.querySelectorAll(".spidey-scene-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSceneIndex = parseInt(btn.getAttribute("data-scene-idx"), 10) || 0;
      renderSpideyHud(currentCampaign);
      const chosen = (currentCampaign.scenes || [])[activeSceneIndex];
      if (chosen) {
        injectPromptIntoFlow(chosen.flowPrompt, false);
      }
    });
  });
}

// Listen for runtime messages from background.js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "SPIDEY_INJECT_PROMPT" && msg.payload) {
    renderSpideyHud(msg.payload);
    injectPromptIntoFlow(msg.payload.prompt, msg.payload.autoTrigger !== false);
  }
});

// Check storage on initial page load if opened freshly by the connector
chrome.storage.local.get("spideyFlowPayload", (data) => {
  const payload = data?.spideyFlowPayload;
  if (payload && Date.now() - (payload.timestamp || 0) < 1000 * 60 * 30) {
    renderSpideyHud(payload);
    if (Date.now() - (payload.timestamp || 0) < 25000) {
      injectPromptIntoFlow(payload.prompt, payload.autoTrigger !== false);
    }
  }
});
