"""Tool-augmented conversational agent using LangChain and LangGraph.

This module implements a conversational agent with memory and tools for
enhanced interactions.
"""

import os
from typing import List, Dict, Optional, Union, cast
from pydantic import SecretStr
from dotenv import load_dotenv

from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.runnables import Runnable, RunnableConfig
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from langchain.agents import AgentExecutor, create_openai_functions_agent
from langchain.memory import ConversationBufferMemory
from langchain.prompts import MessagesPlaceholder, ChatPromptTemplate
from langchain.schema import SystemMessage, BaseMessage

# Load environment variables
load_dotenv()

# Initialize tools
search = DuckDuckGoSearchRun()
tools = [search]

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

# Create agent executor with message history
agent_executor = AgentExecutor(
    agent=agent,
    tools=tools,
    verbose=bool(os.getenv("VERBOSE", "True")),
)

# Store memory instances
memory_store: Dict[str, BaseChatMessageHistory] = {}


def create_memory(session_id: str) -> BaseChatMessageHistory:
    """Create a new memory instance for a session.

    Args:
        session_id: The unique session identifier.

    Returns:
        A chat message history instance.
    """
    if session_id not in memory_store:
        memory = ConversationBufferMemory(
            return_messages=True,
            memory_key="chat_history",
        )
        memory_store[session_id] = memory.chat_memory
    return memory_store[session_id]


# Configure message history
agent_with_chat_history = RunnableWithMessageHistory(
    cast(Runnable, agent_executor),
    create_memory,
    input_messages_key="input",
    history_messages_key="chat_history",
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
        # Use a consistent session ID for this implementation
        session_id = "default_session"
        config: RunnableConfig = {"configurable": {"session_id": session_id}}
        response = agent_with_chat_history.invoke(
            {"input": message},
            config=config
        )
        return {"response": response["output"], "error": None}
    except (ValueError, KeyError, AgentError) as e:
        return {"response": None, "error": str(e)}


def get_chat_history() -> List[BaseMessage]:
    """Retrieve the conversation history.

    Returns:
        List of BaseMessage objects containing the chat history.
    """
    session_id = "default_session"
    memory = memory_store.get(session_id)
    return memory.messages if memory else []


# Export the agent executor as chain for compatibility
chain = agent_with_chat_history
