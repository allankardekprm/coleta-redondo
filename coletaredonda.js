(function () {
    "use strict";

    // 🔗 URL do JSON de autorizados (substitua pelo seu)
  const autorizadosRaw = "https://raw.githubusercontent.com/allankardekprm/coleta-redondo/main/autorizados.json";

    const nomeJogador = (game_data && game_data.player && game_data.player.name)
        ? game_data.player.name.trim()
        : null;

    if (!nomeJogador) return;

    // Função para exibir aviso visual
    function aviso(msg) {
        const div = document.createElement("div");
        div.style.position = "fixed";
        div.style.top = "20px";
        div.style.left = "50%";
        div.style.transform = "translateX(-50%)";
        div.style.background = "rgba(200,0,0,0.9)";
        div.style.color = "#fff";
        div.style.padding = "12px 20px";
        div.style.fontSize = "15px";
        div.style.fontWeight = "bold";
        div.style.borderRadius = "8px";
        div.style.zIndex = "99999";
        div.style.boxShadow = "0 0 10px rgba(0,0,0,0.6)";
        div.textContent = `⛔ ${msg}`;
        document.body.appendChild(div);
    }

    // Função de bloqueio
    function bloquear(msg) {
        console.log("⛔ Script bloqueado:", msg);
        aviso(msg);
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
                        console.log("✅ Acesso liberado até", validade);
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
    // ⚔️ Coletor automático (executa somente se autorizado)
    // ==================================================
    function iniciarScript() {
        console.log("⚔️ Script iniciado para:", nomeJogador);

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

        function randonTime(min, max) {
            return Math.round(min + Math.random() * (max - min));
        }

        function getBlockedScavenges() {
            return document.getElementsByClassName("unlock-button").length;
        }

        function getAvailableScavenges() {
            return document.getElementsByClassName("free_send_button");
        }

        function getScavengeWeight() {
            const blocked = getBlockedScavenges();
            let weightArray = scavengeWeights;
            if (blocked > 0) {
                weightArray = weightArray.slice(0, weightArray.length - blocked);
            }
            return weightArray.reduce((a, b) => a + b, 0);
        }

        function getSelectedUnits() {
            return unidades.filter(unit => {
                const checkbox = document.getElementById(`check_${unit}`);
                return checkbox && checkbox.checked;
            });
        }

        function getAvailableTroops() {
            const allowedUnits = getSelectedUnits();
            const unitElements = document.getElementsByClassName("units-entry-all");
            const troops = [];

            for (const el of unitElements) {
                const unit = el.getAttribute("data-unit");
                if (allowedUnits.includes(unit)) {
                    const quantity = parseInt(el.textContent.replace("(", "").replace(")", ""));
                    troops.push({ unit, quantity });
                }
            }
            return troops;
        }

        function calculateScavengeTroops(weight, troops) {
            const totalWeight = getScavengeWeight();
            return troops.map(t => ({
                unit: t.unit,
                quantityToSend: Math.floor((t.quantity * weight) / totalWeight)
            }));
        }

        function hasEnoughTroops(troopsToSend, availableTroops) {
            return troopsToSend.every(t => {
                const available = availableTroops.find(at => at.unit === t.unit);
                return available && available.quantity >= t.quantityToSend;
            });
        }

        function sendScavenge(weight, troops, element) {
            const troopsToSend = calculateScavengeTroops(weight, troops);
            if (!hasEnoughTroops(troopsToSend, troops)) {
                console.log("Tropas insuficientes para esta coleta.");
                return;
            }

            for (const troop of troopsToSend) {
                if (troop.quantityToSend > 0) {
                    const input = document.querySelector(`input[name='${troop.unit}']`);
                    if (input) {
                        input.value = troop.quantityToSend.toString();
                        input.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                }
            }

            element.click();
            coletasRealizadas++;
            atualizarPainel();
        }

        function trocarAldeia() {
            const nextButton = document.querySelector(".arrowRight");
            if (nextButton) {
                nextButton.click();
            } else {
                const event = new KeyboardEvent("keydown", {
                    bubbles: true,
                    cancelable: true,
                    key: "d",
                    code: "KeyD",
                    keyCode: 68,
                    which: 68,
                });
                document.dispatchEvent(event);
            }
        }

        function iniciarColeta() {
            if (pausado) return;
            const troops = getAvailableTroops();
            const availableScavenges = getAvailableScavenges();

            for (let i = 0; i < availableScavenges.length; i++) {
                const weight = scavengeWeights[i];
                const element = availableScavenges[i];
                const delay = 3000 * i;
                setTimeout(() => sendScavenge(weight, troops, element), delay);
            }
        }

        function criarPainel() {
            const painel = document.createElement("div");
            painel.id = "painel-coleta";
            painel.style.position = "fixed";
            painel.style.bottom = "50px";
            painel.style.right = "11px";
            painel.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
            painel.style.color = "#fff";
            painel.style.padding = "12px";
            painel.style.borderRadius = "10px";
            painel.style.zIndex = "9999";
            painel.style.fontSize = "13px";
            painel.style.maxWidth = "220px";
            painel.style.lineHeight = "1.4em";

            let html = `<strong>🛠️ Auto Coleta [v2.1]</strong><br>`;
            for (const unit of unidades) {
                html += `<label><input type="checkbox" id="check_${unit}" ${["spear","sword","axe","archer"].includes(unit)?"checked":""}> ${nomesUnidades[unit]}</label><br>`;
            }
            html += `<i id="i_toggle_status" class="far fa-toggle-on on"></i><br>`;
            html += `<button id="btnToggle" style="margin-top:6;width:100%;">${pausado ? "▶️ Ativar" : "⏸️ Desativar"}</button><br>`;
            html += `<strong>Coletas:</strong> <span id="contador-coleta">0</span>`;

            painel.innerHTML = html;
            document.body.appendChild(painel);

            document.getElementById("btnToggle").addEventListener("click", () => {
                pausado = !pausado;
                localStorage.setItem("coletaStatus", pausado);
                document.getElementById("btnToggle").textContent = pausado ? "▶️ Ativar" : "⏸️ Desativar";
                const icon = document.getElementById("i_toggle_status");
                if (pausado) {
                    icon.classList.remove("on");
                    icon.classList.add("off");
                } else {
                    icon.classList.remove("off");
                    icon.classList.add("on");
                }
            });
        }

        function atualizarPainel() {
            const contador = document.getElementById("contador-coleta");
            if (contador) contador.textContent = coletasRealizadas;
        }

        window.addEventListener("load", () => {
            setTimeout(() => {
                criarPainel();
                if (!pausado) iniciarColeta();
                setInterval(() => { if (!pausado) trocarAldeia(); }, 15000);
            }, 1000);
        });

        const reloadTime = randonTime(300000, 600000);
        console.log(`🔄 Recarregando em ${Math.floor(reloadTime/1000)}s...`);
        setTimeout(() => {
            console.log("🔁 Recarregando página...");
            location.reload(true);
        }, reloadTime);
    }
})();
