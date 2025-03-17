# LangChain/LangGraph Conversational Agent

A powerful conversational agent built with LangChain and LangGraph, featuring:

- Tool-augmented responses using web search and calculator
- Intelligent tool selection based on user queries
- Clean and modern Gradio interface
- Conversation memory and history

## Features

1. **Intelligent Tool Usage**
   - Web search for real-time information
   - Calculator for mathematical expressions
   - Automatic tool selection based on query context

2. **LangGraph Workflow**
   - Graph-based decision making
   - Efficient tool execution
   - Error handling and recovery

3. **Modern Interface**
   - Clean and responsive Gradio UI
   - Chat history display
   - Easy-to-use message input

## Setup

1. Install dependencies:

   ```bash
   pip install langchain langchain-openai langgraph gradio python-dotenv
   ```

2. Set up environment variables:
   Create a `.env` file with:

   ``
   OPENAI_API_KEY=your_api_key_here
   ``

3. Run the application:

   ```bash
   python app.py
   ```

## Usage

1. The interface will be available at `http://localhost:7860`
2. Type your message in the input box
3. Click "Send" or press Enter to submit
4. The agent will:
   - Process your message
   - Use tools if needed
   - Provide a helpful response

## Example Queries

1. Information lookup:

   ``
   What's the latest news about artificial intelligence?
   ``

2. Calculations:

   ``
   What's the result of 15% of 850 plus 300?
   ``

3. Combined queries:

   ``
   What's the current temperature in New York in Celsius, converted to Fahrenheit?
   ``

## Architecture

The implementation uses a graph-based approach with LangGraph:

``
[User Input] → [Agent] → [Tool Selection] → [Tool Execution] → [Response]
                 ↑                                    |
                 └────────────────────────────────────┘
``

- `agent.py`: Core logic and tool implementation
- `app.py`: Gradio interface and conversation management
