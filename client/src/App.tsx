export default function App() {
  console.log("App component is rendering!");
  
  return (
    <div style={{
      padding: "40px",
      fontFamily: "system-ui",
      background: "#f5f5f5",
      minHeight: "100vh"
    }}>
      <h1 style={{ color: "#333", fontSize: "48px", marginBottom: "20px" }}>
        App is Working!
      </h1>
      <p style={{ color: "#666", fontSize: "20px" }}>
        If you see this, React is rendering correctly.
      </p>
      <div style={{
        marginTop: "40px",
        padding: "20px",
        background: "white",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
      }}>
        <h2 style={{ color: "#444", marginBottom: "10px" }}>Test Content</h2>
        <p>This is a test to verify the preview is showing content.</p>
      </div>
    </div>
  );
}
