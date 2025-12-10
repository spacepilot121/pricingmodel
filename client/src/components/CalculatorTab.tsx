export default function CalculatorTab() {
  const legacyCalculatorUrl = `${import.meta.env.BASE_URL}legacy-calculator.html`;

  return (
    <div className="card" style={{ padding: 0 }}>
      <iframe
        src={legacyCalculatorUrl}
        title="Pricing calculator"
        style={{ border: 'none', width: '100%', height: '80vh', borderTop: '1px solid #e5e5ea' }}
      />
    </div>
  );
}
