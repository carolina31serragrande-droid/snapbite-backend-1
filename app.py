from flask import Flask, request, jsonify
from flask_cors import CORS
from openai import OpenAI
import os

app = Flask(__name__)
CORS(app)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

@app.route("/")
def home():
    return "IA SnapBite online ✅"

@app.route("/chat", methods=["POST"])
def chat():
    dados = request.get_json()
    mensagem = dados.get("mensagem", "")

    try:
        resposta = client.responses.create(
            model="gpt-4.1-mini",
            input=[
                {
                    "role": "system",
                    "content": """
Você é a IA oficial da SnapBite, uma lanchonete para estudantes do SENAI.
Responda em português brasileiro, de forma natural, jovem e útil.
Ajude com lanches, combos, bebidas, preços, horários, pedidos e dúvidas do site.

Horários de compra:
Manhã: 07:00 às 08:30
Tarde: 11:00 às 12:30

Não invente preços exatos se não forem informados.
Se o cliente perguntar algo fora do SnapBite, responda brevemente e puxe de volta para ajudar no pedido.
"""
                },
                {
                    "role": "user",
                    "content": mensagem
                }
            ]
        )

        texto = resposta.output_text

        return jsonify({"resposta": texto})

    except Exception as erro:
        print("ERRO:", erro)
        return jsonify({
            "resposta": "⚠️ Tive um problema pra responder agora. Tenta de novo em alguns segundos."
        }), 500

if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 5000)),
        debug=False
    )
