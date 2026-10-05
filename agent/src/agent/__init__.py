import os
from pathlib import Path

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph


def main() -> None:
    # 从 agent 项目根目录读取 .env
    env_path = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(env_path)

    required = ("LLM_API_KEY", "LLM_BASE_URL", "LLM_MODEL")
    missing = [name for name in required if not os.getenv(name)]

    if missing:
        raise ValueError(f"请在 .env 中配置：{', '.join(missing)}")

    model = ChatOpenAI(
        api_key=os.environ["LLM_API_KEY"],
        base_url=os.environ["LLM_BASE_URL"],
        model=os.environ["LLM_MODEL"],
        timeout=60,
        max_retries=0,
        extra_body={"enable_thinking": False},
    )

    def call_model(state: MessagesState):
        reply = model.invoke(state["messages"])
        return {"messages": [reply]}

    builder = StateGraph(MessagesState)
    builder.add_node("call_model", call_model)
    builder.add_edge(START, "call_model")
    builder.add_edge("call_model", END)

    graph = builder.compile()

    result = graph.invoke(
        {
            "messages": [
                ("user", "你好，请用一句中文确认你已收到我的测试消息。")
            ]
        }
    )

    print(result["messages"][-1].content)
