from flask import Flask, request, jsonify
from flask_cors import CORS
from datetime import datetime

app = Flask(__name__)
CORS(app)

CARDAPIO = {
    "salgados": ["Coxinha", "Enroladinho", "Pastel", "Pão de queijo"],
    "bebidas": ["Água", "Suco", "Refrigerante"],
    "doces": ["Brownie", "Brigadeiro", "Bolo"],
    "combos": ["Coxinha + Refri", "Pastel + Suco", "Pão de queijo + Café"]
}

def horario_aberto():
    agora = datetime.now().time()
    manha = agora.replace(hour=7, minute=0) <= agora <= agora.replace(hour=8, minute=30)
    tarde = agora.replace(hour=11, minute=0) <= agora <= agora.replace(hour=12, minute=30)
    return manha or tarde

def responder(mensagem):
    msg = mensagem.lower().strip()

    if any(x in msg for x in ["oi", "opa", "ola", "olá", "eae", "iae", "i ae", "bom dia", "boa tarde"]):
        return "Opa! 😄 Eu sou a IA da SnapBite. Posso te ajudar com lanches, combos, bebidas, preços, horários e pedidos."

    if any(x in msg for x in ["cardapio", "cardápio", "menu", "pedidos", "dá os pedidos", "manda os pedidos"]):
        return f"Temos: salgados {CARDAPIO['salgados']}, bebidas {CARDAPIO['bebidas']}, doces {CARDAPIO['doces']} e combos {CARDAPIO['combos']}."

    if "combo" in msg or "barato" in msg or "promo" in msg:
        return "🔥 Recomendo o combo Coxinha + Refri. É rápido, barato e perfeito pro intervalo."

    if "bebida" in msg or "refri" in msg or "suco" in msg or "agua" in msg or "água" in msg:
        return "🥤 Temos água, suco e refrigerante. Quer que eu indique uma bebida pra combinar com algum lanche?"

    if "horario" in msg or "horário" in msg or "abre" in msg or "funciona" in msg:
        if horario_aberto():
            return "✅ A SnapBite está aberta agora para pedidos."
        return "⏰ Agora estamos fora do horário de pedidos. Funcionamos 07:00–08:30 e 11:00–12:30."

    if "pix" in msg or "cartão" in msg or "cartao" in msg or "pagamento" in msg:
        return "💳 Aceitamos PIX, cartão e dinheiro."

    if "obrigado" in msg or "valeu" in msg:
        return "Tmj! 😄 Qualquer coisa é só chamar a IA da SnapBite."

    return "🤔 Não entendi muito bem... Posso ajudar com lanches, combos, bebidas, horários, pagamentos e promoções."

@app.route("/chat", methods=["POST"])
def chat():
    dados = request.get_json()
    mensagem = dados.get("mensagem", "")

    resposta = responder(mensagem)

    return jsonify({
        "resposta": resposta
    })
    
import os

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
