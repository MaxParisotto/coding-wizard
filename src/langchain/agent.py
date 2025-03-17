"""Tool-augmented conversational agent using LangChain and LangGraph.

This module implements a conversational agent with memory and tools for
enhanced interactions.
"""

import os
from typing import List, Dict, Optional, Union
from pydantic import SecretStr
from dotenv import load_dotenv
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from langchain.memory import ConversationBufferMemory
from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.prompts import MessagesPlaceholder, ChatPromptTemplate
from langchain.schema import SystemMessage, BaseMessage

# Load environment variables
load_dotenv()

# Initialize tools
search = DuckDuckGoSearchRun()
tools = [search]
# Initialize memory
memory = ConversationBufferMemory(
    memory_key="chat_history",
    return_messages=True
)

# Create system message
system_message = SystemMessage(
    content=(
        "You are a helpful AI assistant that can use tools to answer "
        "questions. Always provide accurate and relevant information."
    )
)


def get_chat_model() -> Union[ChatOpenAI, ChatOllama]:
    """Get the appropriate chat model based on configuration.

    Returns:
        Union[ChatOpenAI, ChatOllama]: The configured chat model.

    Raises:
        ValueError: If OpenAI is selected but API key is missing.
    """
    model_type = os.getenv("MODEL_TYPE", "openai").lower()

    if model_type == "ollama":
        base_url = os.getenv("OLLAMA_BASE_URL", "http://192.168.2.252:11434")
        model = os.getenv("OLLAMA_MODEL", "llama2")
        return ChatOllama(base_url=base_url, model=model, temperature=0)

    # Default to OpenAI
    api_key = os.getenv("OPENAI_API_KEY")
    if api_key:
        return ChatOpenAI(temperature=0, api_key=SecretStr(api_key))
    raise ValueError("OpenAI API key not found in environment variables")


# Initialize chat model
chat_model = get_chat_model()

# Create prompt
prompt = ChatPromptTemplate.from_messages(
    [
        system_message,
        MessagesPlaceholder(variable_name="chat_history"),
        MessagesPlaceholder(variable_name="agent_scratchpad"),
    ]
)

# Create agent
agent = create_openai_functions_agent(chat_model, tools, prompt)

# Create agent executor
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    memory=memory,
    verbose=bool(os.getenv("VERBOSE", "True")),
)


class AgentError(Exception):
    """Custom exception for agent-related errors."""


def process_message(message: str) -> Dict[str, Optional[str]]:
    """Process a user message and return the agent's response.

    Args:
        message: The user's input message.

    Returns:
        Dict containing the agent's response and any error message.
    """
    try:
        response = agent_executor.invoke({"input": message})
        return {"response": response["output"], "error": None}
    except (ValueError, KeyError, AgentError) as e:
        return {"response": None, "error": str(e)}


def get_chat_history() -> List[BaseMessage]:
    """Retrieve the conversation history.

    Returns:
        List of BaseMessage objects containing the chat history.
    """
    if hasattr(memory.chat_memory, "messages"):
        return memory.chat_memory.messages
    return []


# Export the agent executor as chain for compatibility
chain = agent_executor
