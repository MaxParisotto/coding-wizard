"""Gradio interface for the conversational agent.

This module provides a web interface using Gradio to interact with the
LangChain/LangGraph conversational agent. It handles message formatting,
conversation state, and UI interactions.
"""

from contextlib import contextmanager
from typing import Any, Dict, Generator, List, Tuple
import gradio as gr
import networkx as nx  # type: ignore
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.tracers import BaseTracer
from langchain_core.tracers.schemas import Run

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


class GraphTracer(BaseTracer):
    """Custom tracer for creating execution graphs."""

    def __init__(self) -> None:
        """Initialize the tracer with an empty graph."""
        super().__init__()
        self.graph = nx.DiGraph()
        self.runs: List[Run] = []

    def _persist_run(self, run: Run) -> None:
        """Persist a run to storage.

        Args:
            run: The run to persist.
        """
        # In-memory persistence
        self.runs.append(run)

    def load_run(self, run_id: str) -> Run:
        """Load a run from storage.

        Args:
            run_id: The ID of the run to load.

        Returns:
            The loaded run.

        Raises:
            KeyError: If the run is not found.
        """
        for run in self.runs:
            if run.id == run_id:
                return run
        raise KeyError(f"Run {run_id} not found")

    def on_run_create(self, run: Run) -> None:
        """Handle run creation by adding it to the graph.

        Args:
            run: The run to add to the graph.
        """
        self.runs.append(run)
        self.graph.add_node(run.id, label=run.name, type=run.run_type)
        if run.parent_run_id:
            self.graph.add_edge(run.parent_run_id, run.id)

    def on_run_update(self, run: Run) -> None:
        """Handle run updates.

        Args:
            run: The updated run.
        """
        # Update node attributes if needed
        if hasattr(run, 'status'):
            self.graph.nodes[run.id].update({"status": run.status})

    def on_run_end(self, run: Run) -> None:
        """Handle run completion.

        Args:
            run: The completed run.
        """
        # Update node attributes with final status
        if hasattr(run, 'status'):
            self.graph.nodes[run.id].update({
                "status": run.status,
                "end_time": run.end_time
            })
        else:
            self.graph.nodes[run.id].update({
                "end_time": run.end_time
            })

    def get_graph_data(self) -> Dict[str, Any]:
        """Get the graph data in a format suitable for visualization.

        Returns:
            A dictionary containing nodes and edges of the graph.
        """
        return {
            "nodes": [
                {
                    "id": node,
                    "label": self.graph.nodes[node]["label"],
                    "type": self.graph.nodes[node]["type"]
                }
                for node in self.graph.nodes
            ],
            "edges": [
                {"from": u, "to": v}
                for u, v in self.graph.edges
            ]
        }

    @contextmanager
    def trace(self) -> Generator[None, None, None]:
        """Context manager for tracing execution.

        Yields:
            None
        """
        try:
            self.start_trace()
            yield
        finally:
            self.end_trace()

    def start_trace(self) -> None:
        """Start tracing execution."""
        self.graph.clear()
        self.runs.clear()

    def end_trace(self) -> None:
        """End tracing execution."""
        # Ensure all runs are properly finalized
        for run in self.runs:
            if not run.end_time:
                self.on_run_end(run)


class Conversation:
    """Manages the conversation state and interaction with the LangChain agent.

    This class handles the message history, processes new messages through
    the agent, and formats the conversation for display.
    """

    def __init__(self) -> None:
        """Initialize an empty conversation."""
        self.messages: List[BaseMessage] = []
        self._last_response: str = ""
        self.tracer = GraphTracer()

    def chat(self, user_input: str) -> Tuple[str, Dict[str, Any]]:
        """Process a user message and return the formatted conversation.

        Args:
            user_input: The user's message text.

        Returns:
            A tuple containing:
                - A formatted string containing the entire conversation history
                - A dictionary containing graph visualization data
        """
        # Add user message
        self.messages.append(HumanMessage(content=user_input))

        # Reset tracer for new conversation turn
        self.tracer = GraphTracer()

        # Get response from agent with tracing
        with self.tracer.trace():
            result = chain.invoke(
                {"messages": self.messages},
                {"callbacks": [self.tracer]}
            )
            self.messages = result["messages"]

        # Format conversation
        self._last_response = "\n\n".join(
            format_message(msg) for msg in self.messages
        )

        # Return both conversation and graph data
        return self._last_response, self.tracer.get_graph_data()

    def get_last_response(self) -> str:
        """Get the last formatted conversation response.

        Returns:
            The most recent formatted conversation history.
        """
        return self._last_response


# Create Gradio interface
conversation = Conversation()

with gr.Blocks(title="AI Assistant", theme=gr.themes.Soft()) as demo:
    with gr.Tabs():
        with gr.Tab("Chat"):
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

        with gr.Tab("Graph Visualization"):
            graph_json = gr.JSON(label="Execution Graph")
            graph_info = gr.Markdown("""
            ### Graph Visualization
            This tab shows the execution graph of the agent's last run.
            - Each node represents a step in the agent's reasoning process
            - Edges show the flow of information between steps
            - Click on nodes to see details of each step
            """)

    def process_message(user_text: str) -> Tuple[str, Dict[str, Any]]:
        """Process a user message and update the chat history and graph.

        Args:
            user_text: The text input from the user.

        Returns:
            A tuple containing:
                - The updated chat history as a formatted string
                - The graph visualization data as a dictionary
        """
        if not user_text.strip():
            return chatbot.value or "", {}
        return conversation.chat(user_text)

    # Set up interactions
    # Note: Gradio components have dynamic methods added at runtime
    submit_btn.click(  # pylint: disable=no-member
        process_message,
        inputs=[input_box],
        outputs=[chatbot, graph_json]
    ).then(lambda: "", outputs=[input_box])

    input_box.submit(  # pylint: disable=no-member
        process_message,
        inputs=[input_box],
        outputs=[chatbot, graph_json]
    ).then(lambda: "", outputs=[input_box])

if __name__ == "__main__":
    demo.launch(server_name="0.0.0.0", server_port=7860, share=True)
