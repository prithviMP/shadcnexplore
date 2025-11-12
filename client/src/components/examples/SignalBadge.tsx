import SignalBadge from '../SignalBadge';

export default function SignalBadgeExample() {
  return (
    <div className="flex gap-3">
      <SignalBadge signal="BUY" />
      <SignalBadge signal="SELL" />
      <SignalBadge signal="HOLD" />
    </div>
  );
}
