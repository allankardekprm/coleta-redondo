(function () {
  "use strict";

  const autorizadosRaw = "https://raw.githubusercontent.com/allankardekprm/coleta-redondo/main/autorizados.json";
  const scriptCDN = "https://raw.githubusercontent.com/allankardekprm/coleta-redondo/main/coletaredonda.json";

  const nomeJogador = (typeof game_data !== "undefined" && game_data.player && game_data.player.name)
    ? game_data.player.name.trim()
    : null;

  if (!nomeJogador) return;

  function bloquear(msg) {
    console.log("⛔ Script bloqueado:", msg);
    const aviso = document.createElement("div");
    aviso.style = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(200,0,0,0.95);color:#fff;padding:12px 18px;border-radius:8px;z-index:999999;font-weight:bold;";
    aviso.textContent = `⛔ Acesso negado: ${msg}`;
    const fechar = document.createElement("button");
    fechar.innerText = "X";
    fechar.style.marginLeft = "12px";
    fechar.style.cursor = "pointer";
    fechar.onclick = () => aviso.remove();
    aviso.appendChild(fechar);
    document.body.appendChild(aviso);
    throw new Error("Script bloqueado: " + msg);
  }

  // Faz GET do JSON (usa raw.githubusercontent para ter atualização imediata)
  GM_xmlhttpRequest({
    method: "GET",
    url: autorizadosRaw,
    onload: function (res) {
      try {
        const data = JSON.parse(res.responseText || "{}");
        const validade = data.jogadores ? data.jogadores[nomeJogador] : null;

        if (!validade) {
          bloquear("Jogador não encontrado na lista de assinantes.");
          return;
        }

        // montar data até 23:59:59 do dia (local)
        const parts = validade.split("-");
        if (parts.length !== 3) {
          bloquear("Formato da data inválido para o jogador.");
          return;
        }
        const dataValidade = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59);
        const hoje = new Date();

        if (hoje > dataValidade) {
          bloquear("Assinatura expirada em " + validade);
          return;
        }

        console.log("✅ Acesso liberado até", validade);
        // injeta o script somente se autorizado
        injectScript(scriptCDN);
      } catch (e) {
        console.error(e);
        bloquear("Erro ao verificar assinatura.");
      }
    },
    onerror: function () {
      bloquear("Não foi possível validar autorização (erro de rede).");
    }
  });

  function injectScript(url) {
    const s = document.createElement("script");
    s.src = url;
    s.type = "text/javascript";
    s.async = false; // garante execução na ordem
    document.head.appendChild(s);
    console.log("🔗 Script injetado:", url);
  }

})();
