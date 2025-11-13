export default function App() {
  return (
    <div style={{
      width: "100vw",
      height: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      fontFamily: "system-ui, -apple-system, sans-serif"
    }}>
      <div style={{
        background: "white",
        padding: "60px",
        borderRadius: "20px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        textAlign: "center"
      }}>
        <h1 style={{
          fontSize: "48px",
          margin: "0 0 20px 0",
          color: "#667eea"
        }}>
          ✅ React is Working!
        </h1>
        <p style={{
          fontSize: "20px",
          color: "#666",
          margin: "0"
        }}>
          The application is rendering correctly.
        </p>
        <p style={{
          fontSize: "16px",
          color: "#999",
          marginTop: "20px"
        }}>
          If you see this, React is mounted and running.
        </p>
      </div>
    </div>
  );
}
