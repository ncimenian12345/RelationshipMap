# Mushroom Map

An interactive relationship visualization tool built with React, featuring pan/zoom controls, node dragging, and dynamic link creation.

## Features

- 🎨 **Interactive Canvas**: Pan, zoom, and navigate through the relationship map
- 🔄 **Drag & Drop**: Move nodes around to reorganize your map
- ➕ **Dynamic Creation**: Add new nodes and links on the fly
- 🎯 **Focus Mode**: Click nodes to highlight their connections
- 📊 **Multiple Link Types**: Solid, dashed, and curved connections
- 🏷️ **Group Organization**: Nodes organized by customizable groups

## Getting Started

### Prerequisites

- Node.js 16+ and npm/yarn installed

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd relationship-map
```

2. Install dependencies:
```bash
npm install
```

3. In a separate terminal, start the API server:
```bash
npm run server
```

4. Start the front-end development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:5173`

> The front end expects API requests to be sent to the URL specified in the
> `VITE_API_URL` environment variable. When running locally the default is
> `http://localhost:3000`, but you can override this by exporting
> `VITE_API_URL` before starting `npm run dev`. Production builds default to
> `https://relationship-map.vercel.app` when no environment override is
> provided.

## Usage

### Navigation
- **Pan**: Click and drag on the canvas background
- **Zoom**: Use mouse wheel or zoom controls
- **Reset View**: Click the "Reset" button to fit all nodes in view

### Working with Nodes
- **Select**: Click on any node to focus it
- **Move**: Click and drag a node to reposition it
- **Add**: Use the "Add Node" panel at the bottom

### Creating Links
- Use the "Add Link" panel at the bottom
- Enter source and target node IDs
- Select link type (solid, dashed, or curved)

## Project Structure

```
src/
├── components/
│   └── RelationshipMap/
│       ├── components/      # UI components (Node, Edge, Controls, etc.)
│       ├── hooks/           # Custom React hooks
│       ├── utils/           # Helper functions
│       └── data/            # Demo data and configuration
├── App.jsx                  # Main application component
├── main.jsx                 # Application entry point
└── index.css               # Global styles
```

## Customization

### Modifying Demo Data

Edit `src/components/RelationshipMap/data/demo.js` to change the initial nodes and links.

### Styling

The project uses Tailwind CSS for styling. Modify the components or `tailwind.config.js` to customize the appearance.

### Adding New Features

The modular structure makes it easy to extend:
- Add new node types in `components/Node.jsx`
- Create custom link styles in `components/Edge.jsx`
- Extend the control panel in `components/BottomPanel/`

## Build for Production

```bash
npm run build
```

The production-ready files will be in the `dist/` folder.

## Technologies Used

- **React** - UI framework
- **Tailwind CSS** - Styling
- **Vite** - Build tool and dev server
- **SVG** - Rendering the graph visualization

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.