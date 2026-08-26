import Image from "next/image";

export function BrandIcon() {
  return (
    <Image
      className="brand-icon"
      src="/nanonux_business_central_icon.png"
      alt=""
      width={72}
      height={72}
      aria-hidden="true"
    />
  );
}
