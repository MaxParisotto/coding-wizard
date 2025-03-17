"""Gradio interface for the conversational agent.

This module provides a web interface using Gradio to interact with the
LangChain/LangGraph conversational agent. It handles message formatting,
conversation state, and UI interactions.
"""

from typing import List

import gradio as gr
from langchain_core.messages import BaseMessage, HumanMessage

from agent import chain


def format_message(msg: BaseMessage) -> str:
    """Format a message for display.

    Args:
        msg: The message to format.

    Returns:
        A formatted string representation of the message.
    """
    if msg.type == "human":
        return f"You: {msg.content}"
    return f"Assistant: {msg.content}"


class Conversation:
    """Manages the conversation state and interaction with the LangChain agent.

    This class handles the message history, processes new messages through
    the agent, and formats the conversation for display.
    """

    def __init__(self) -> None:
        """Initialize an empty conversation."""
        self.messages: List[BaseMessage] = []
        self._last_response: str = ""

    def chat(self, user_input: str) -> str:
        """Process a user message and return the formatted conversation.

        Args:
            user_input: The user's message text.

        Returns:
            A formatted string containing the entire conversation history.
        """
        # Add user message
        self.messages.append(HumanMessage(content=user_input))

        # Get response from agent
        result = chain.invoke({"messages": self.messages})
        self.messages = result["messages"]
        self._last_response = "\n\n".join(
            format_message(msg) for msg in self.messages
        )
        return self._last_response

    def get_last_response(self) -> str:
        """Get the last formatted conversation response.

        Returns:
            The most recent formatted conversation history.
        """
        return self._last_response


# Create Gradio interface
conversation = Conversation()

with gr.Blocks(title="AI Assistant", theme=gr.themes.Soft()) as demo:
    with gr.Row():
        with gr.Column(scale=4):
            chatbot = gr.Textbox(
                label="Chat History",
                lines=15,
                max_lines=15,
                interactive=False
            )

            with gr.Row():
                input_box = gr.Textbox(
                    label="Your Message",
                    lines=2,
                    placeholder="Type your message here..."
                )
                submit_btn = gr.Button("Send", variant="primary")

    def process_message(user_text: str) -> str:
        """Process a user message and update the chat history.

        Args:
            user_text: The text input from the user.

        Returns:
            The updated chat history as a formatted string.
        """
        if not user_text.strip():
            return chatbot.value or ""
        return conversation.chat(user_text)

    # Set up interactions
    # Note: Gradio components have dynamic methods added at runtime
    submit_btn.click(  # pylint: disable=no-member
        process_message,
        inputs=[input_box],
        outputs=[chatbot]
    ).then(lambda: "", outputs=[input_box])

    input_box.submit(  # pylint: disable=no-member
        process_message,
        inputs=[input_box],
        outputs=[chatbot]
    ).then(lambda: "", outputs=[input_box])

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, share=True)
