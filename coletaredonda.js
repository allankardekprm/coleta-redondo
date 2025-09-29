// ==UserScript==
// @name         Coleta Redondo (Troca 15s)
// @namespace    https://github.com/allankardekprm/coleta-redondo
// @version      2.5
// @description  Coleta automática com 10 população, painel flutuante, seleção de tropas, pausa e troca de aldeia a cada 15 segundos
// @author       Botzão
// @match        https://*.tribalwars.com.br/*screen=place&mode=scavenge*
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  const urlAutorizados = "https://raw.githubusercontent.com/allankardekprm/coleta-redondo/main/autorizados.json";
  const nomeJogador = (game_data && game_data.player && game_data.player.name)
    ? game_data.player.name.trim()
    : null;

  if (!nomeJogador) return;

  // Função para exibir aviso compacto
  function aviso(msg, cor = "rgba(200,0,0,0.9)") {
    const div = document.createElement("div");
    div.style.position = "fixed";
    div.style.top = "10px";
    div.style.left = "50%";
    div.style.transform = "translateX(-50%)";
    div.style.background = cor;
    div.style.color = "#fff";
    div.style.padding = "10px 20px";
    div.style.fontSize = "14px";
    div.style.fontWeight = "bold";
    div.style.borderRadius = "6px";
    div.style.zIndex = "99999";
    div.style.boxShadow = "0 0 8px rgba(0,0,0,0.6)";
    div.style.display = "flex";
    div.style.alignItems = "center";
    div.style.justifyContent = "space-between";
    div.innerHTML = `<span>${msg}</span><button style="margin-left:10px;background:#fff;color:#000;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;">✖</button>`;
    document.body.appendChild(div);
    div.querySelector("button").addEventListener("click", () => div.remove());
  }

  // Função de bloqueio
  function bloquear(msg) {
    console.log("⛔ Script bloqueado:", msg);
    aviso(msg, "rgba(220,0,0,0.95)");
    throw new Error("Script bloqueado.");
  }

  // Validação online
  GM_xmlhttpRequest({
    method: "GET",
    url: urlAutorizados,
    onload: function (response) {
      try {
        const data = JSON.parse(response.responseText);
        const validade = data.jogadores[nomeJogador];

        if (!validade) {
          bloquear("Jogador não encontrado na lista de assinantes.");
        } else {
          const hoje = new Date();
          const dataValidade = new Date(validade);

          if (hoje > dataValidade) {
            bloquear("Assinatura expirada em " + validade);
          } else {
            aviso(`✅ Acesso liberado até ${validade}`, "rgba(0,150,0,0.9)");
            iniciarScript();
          }
        }
      } catch (e) {
        bloquear("Erro ao verificar assinatura.");
      }
    },
    onerror: function () {
      bloquear("Não foi possível validar autorização.");
    }
  });

  // ==================================================
  // ⚔️ Coletor automático (mesmo do v1.6)
  // ==================================================
  function iniciarScript() {
    let coletasRealizadas = 0;
    let pausado = localStorage.getItem("coletaStatus") === "false" ? true : false;
    const unidades = ["spear", "sword", "archer", "axe"];
    const nomesUnidades = {
      spear: "Lanceiro",
      sword: "Espada",
      axe: "Machado",
      archer: "Arqueiro",
      spy: "Explorador",
      light: "Cav. Leve",
      marcher: "Cav. Arqueiro",
      heavy: "Cav. Pesada",
      knight: "Paladino",
      snob: "Nobre"
    };
    const scavengeWeights = [15, 6, 3, 2];

    function randonTime(min, max) { return Math.round(min + Math.random() * (max - min)); }
    function getBlockedScavenges() { return document.getElementsByClassName("unlock-button").length; }
    function getAvailableScavenges() { return document.getElementsByClassName("free_send_button"); }
    function getScavengeWeight() {
      const blocked = getBlockedScavenges();
      let weightArray = scavengeWeights;
      if (blocked > 0) weightArray = weightArray.slice(0, weightArray.length - blocked);
      return weightArray.reduce((a, b) => a + b, 0);
    }
    function getSelectedUnits() { return unidades.filter(u => document.getElementById(`check_${u}`)?.checked); }
    function getAvailableTroops() {
      const allowed = getSelectedUnits();
      return Array.from(document.getElementsByClassName("units-entry-all"))
        .map(el => ({ unit: el.getAttribute("data-unit"), quantity: parseInt(el.textContent.replace(/[()]/g, "")) }))
        .filter(t => allowed.includes(t.unit));
    }
    function calculateScavengeTroops(weight, troops) {
      const total = getScavengeWeight();
      return troops.map(t => ({ unit: t.unit, quantityToSend: Math.floor((t.quantity * weight) / total) }));
    }
    function hasEnoughTroops(toSend, available) {
      return toSend.every(t => available.find(a => a.unit === t.unit)?.quantity >= t.quantityToSend);
    }
    function sendScavenge(weight, troops, el) {
      const toSend = calculateScavengeTroops(weight, troops);
      if (!hasEnoughTroops(toSend, troops)) { console.log("Tropas insuficientes"); return; }
      toSend.forEach(t => { if (t.quantityToSend > 0) { const i = document.querySelector(`input[name='${t.unit}']`); if (i) { i.value = t.quantityToSend; i.dispatchEvent(new Event("change", { bubbles: true })); } } });
      el.click();
      coletasRealizadas++;
      atualizarPainel();
    }
    function trocarAldeia() {
      const btn = document.querySelector(".arrowRight");
      if (btn) { btn.click(); } else { document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "d", code: "KeyD", keyCode: 68, which: 68 })); }
    }
    function iniciarColeta() {
      if (pausado) return;
      const troops = getAvailableTroops();
      Array.from(getAvailableScavenges()).forEach((el, i) => setTimeout(() => sendScavenge(scavengeWeights[i], troops, el), 3000 * i));
    }
    function criarPainel() {
      const p = document.createElement("div");
      p.id = "painel-coleta";
      p.style.position = "fixed";
      p.style.bottom = "50px";
      p.style.right = "11px";
      p.style.background = "rgba(0,0,0,0.8)";
      p.style.color = "#fff";
      p.style.padding = "12px";
      p.style.borderRadius = "10px";
      p.style.zIndex = "9999";
      p.style.fontSize = "13px";
      p.style.maxWidth = "220px";
      p.style.lineHeight = "1.4em";
      let html = `<strong>🛠️ Auto Coleta [v2.5]</strong><br>`;
      unidades.forEach(u => html += `<label><input type="checkbox" id="check_${u}" ${["spear", "sword", "axe", "archer"].includes(u) ? "checked" : ""}> ${nomesUnidades[u]}</label><br>`);
      html += `<i id="i_toggle_status" class="far fa-toggle-on on"></i><br>`;
      html += `<button id="btnToggle" style="margin-top:6;width:100%;">${pausado ? "▶️ Ativar" : "⏸️ Desativar"}</button><br>`;
      html += `<strong>Coletas:</strong> <span id="contador-coleta">0</span>`;
      p.innerHTML = html;
      document.body.appendChild(p);
      document.getElementById("btnToggle").addEventListener("click", () => {
        pausado = !pausado;
        localStorage.setItem("coletaStatus", pausado);
        document.getElementById("btnToggle").textContent = pausado ? "▶️ Ativar" : "⏸️ Desativar";
        document.getElementById("i_toggle_status").className = pausado ? "far fa-toggle-off off" : "far fa-toggle-on on";
      });
    }
    function atualizarPainel() {
      const c = document.getElementById("contador-coleta");
      if (c) c.textContent = coletasRealizadas;
    }

    window.addEventListener("load", () => {
      setTimeout(() => {
        criarPainel();
        if (!pausado) iniciarColeta();
        setInterval(() => { if (!pausado) trocarAldeia(); }, 15000);
      }, 1000);
    });
    setTimeout(() => location.reload(true), randonTime(300000, 600000));
  }

})();
