// ==UserScript==
// @name         Coleta Redondo com Validador
// @version      2.5
// @description  Valida assinatura e roda coleta automática com painel flutuante
// @author       Botzão
// @match        https://*.tribalwars.com.br/*screen=place&mode=scavenge*
// @run-at       document-end
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
  "use strict";

  const urlAutorizados = "https://raw.githubusercontent.com/allankardekprm/coleta-redondo/refs/heads/main/autorizados.json";
  const nomeJogador = (game_data && game_data.player && game_data.player.name)
    ? game_data.player.name.trim()
    : null;

  if (!nomeJogador) return;

  function aviso(msg, cor = "rgba(200,0,0,0.9)") {
    if (document.getElementById("aviso-coleta")) return;
    const div = document.createElement("div");
    div.id = "aviso-coleta";
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
    div.innerHTML = `<span>${msg}</span><button style="margin-left:10px;background:#fff;color:#000;border:none;padding:2px 6px;border-radius:3px;cursor:pointer;">✖</button>`;
    document.body.appendChild(div);
    div.querySelector("button").addEventListener("click", () => div.remove());
  }

  function bloquear(msg) {
    console.log("⛔ Script bloqueado:", msg);
    aviso(msg, "rgba(220,0,0,0.95)");
  }

  function validar(callbackLiberado) {
    GM_xmlhttpRequest({
      method: "GET",
      url: urlAutorizados,
      onload: function(response) {
        try {
          const data = JSON.parse(response.responseText);
          const validade = data.jogadores[nomeJogador];

          if (!validade) return bloquear("Jogador não encontrado na lista de assinantes.");

          const hoje = new Date();
          const dataValidade = new Date(validade);

          if (hoje > dataValidade) return bloquear("Assinatura expirada em " + validade);

          aviso(`✅ Acesso liberado até ${validade}`, "rgba(0,150,0,0.9)");

          if (typeof callbackLiberado === "function") callbackLiberado();
        } catch (e) {
          bloquear("Erro ao verificar assinatura.");
        }
      },
      onerror: function() {
        bloquear("Não foi possível validar autorização.");
      }
    });
  }

  // ==========================
  // Função de coleta encapsulada
  // ==========================
  function iniciarColetaScript() {
    let coletasRealizadas = 0;
    let pausado = localStorage.getItem("coletaStatus") === "false" ? true : false;
    const unidades = ["spear", "sword", "archer", "axe"];
    const nomesUnidades = { spear: "Lanceiro", sword: "Espada", axe: "Machado", archer: "Arqueiro" };
    const scavengeWeights = [15, 6, 3, 2];

    // ... (coloque aqui todas as funções de coleta: getAvailableTroops, sendScavenge, criarPainel, iniciarColeta, etc.)

    // Exemplo:
    function iniciarColeta() {
      if (pausado) return;
      // ... restante da lógica da coleta
    }

    // Inicializa a coleta
    window.addEventListener("load", () => {
      setTimeout(() => {
        criarPainel();
        if (!pausado) iniciarColeta();
        setInterval(() => { if (!pausado) trocarAldeia(); }, 15000);
      }, 1000);

      setTimeout(() => location.reload(true), randonTime(300000, 600000));
    });
  }

  // 🔹 Chama a função de validação e só roda a coleta se autorizado
  validar(() => {
    console.log("✅ Jogador autorizado, iniciando coleta...");
    iniciarColetaScript();
  });

})();
