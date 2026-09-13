import fs from "fs";
import path from "path";

// Define the 38 comprehensive guide sections covering all pages, CRUD modals, and inspection views
const sections = [
  // 1. Dashboard (Today)
  {
    id: "dashboard",
    route: "/dashboard",
    icon: "home",
    category: "overview",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/dashboard-overview.png",
    title: {
      en: "Dashboard (Today) - Real-time Store Command Center",
      my: "ယနေ့ ဒက်ရှ်ဘုတ် - စတိုးဆိုင် အချိန်နှင့်တပြေးညီ ကွပ်ကဲမှုစင်တာ",
      th: "แดชบอร์ด (วันนี้) - ศูนย์บัญชาการร้านค้าแบบเรียลไทม์",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Real-time command center showing today's gross revenue, completed sales volume, active repair jobs, and immediate stock reorder warnings.",
      my: "ယနေ့ အရောင်းဝင်ငွေ၊ ပြီးစီးခဲ့သော အော်ဒါအရေအတွက်၊ လက်ရှိပြင်ဆင်ဆဲ ပစ္စည်းများနှင့် လက်ကျန်နည်းပစ္စည်း သတိပေးချက်များကို အချိန်နှင့်တပြေးညီ ကြည့်ရှုနိုင်သော ဗဟိုချက်။",
      th: "ศูนย์ควบคุมแบบเรียลไทม์ แสดงยอดขายวันนี้ จำนวนคำสั่งซื้อ งานซ่อมที่กำลังดำเนินการ และการแจ้งเตือนสินค้าใกล้หมดสต็อก.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Real-time KPI Metric Cards",
          my: "အချိန်နှင့်တပြေးညီ အဓိကကိန်းဂဏန်းများ",
          th: "การ์ดสถิติ KPI แบบเรียลไทม์",
        },
        desc: {
          en: "Inspect today's gross revenue, total completed orders, active repair counts, and critical stock depletion alerts at a single glance.",
          my: "ယနေ့ရရှိသော ဝင်ငွေ၊ အော်ဒါစုစုပေါင်း၊ ပြင်ဆင်ဆဲအရေအတွက်နှင့် လက်ကျန်နည်းပစ္စည်း သတိပေးချက်များကို ချက်ချင်းစစ်ဆေးပါ။",
          th: "ตรวจสอบยอดขายรวมวันนี้ จำนวนคำสั่งซื้อที่เสร็จสิ้น งานซ่อมที่ดำเนินการอยู่ และสินค้าที่ต้องสั่งเพิ่มทันที.",
        },
      },
      {
        number: 2,
        label: {
          en: "Quick Action Shortcuts",
          my: "အမြန်လုပ်ဆောင်ချက် ခလုတ်များ",
          th: "ปุ่มลัดการทำงานด่วน",
        },
        desc: {
          en: "Launch a new sale or register an incoming stock shipment with single-click shortcut buttons in the top header.",
          my: "ထိပ်တန်းခလုတ်များမှတစ်ဆင့် အရောင်းအသစ်စတင်ခြင်း သို့မဟုတ် ပစ္စည်းအဝင်သွင်းခြင်းကို ချက်ချင်းလုပ်ဆောင်ပါ။",
          th: "เริ่มการขายใหม่หรือรับสินค้าเข้าคลังได้ทันทีผ่านปุ่มลัดด้านบน.",
        },
      },
      {
        number: 3,
        label: {
          en: "Live Transaction Feed",
          my: "တိုက်ရိုက် အရောင်းမှတ်တမ်းများ",
          th: "รายการธุรกรรมสดล่าสุด",
        },
        desc: {
          en: "Monitor completed and credit transactions as they occur across all cashiers and registers in your store.",
          my: "ဆိုင်အတွင်းရှိ ကောင်တာများမှ အရောင်းနှင့် အကြွေးမှတ်တမ်းများကို အချိန်နှင့်တပြေးညီ တိုက်ရိုက်စောင့်ကြည့်ပါ။",
          th: "ติดตามรายการขายและการชำระเงินที่เกิดขึ้นสดๆ จากทุกจุดแคชเชียร์ในร้าน.",
        },
      },
      {
        number: 4,
        label: {
          en: "Urgent Stock & Sync Alerts",
          my: "အရေးပေါ် ပစ္စည်းလက်ကျန်နှင့် ဒေတာသတိပေးချက်",
          th: "การแจ้งเตือนสินค้าด่วนและการซิงค์",
        },
        desc: {
          en: "Review system warnings for items below safety thresholds and verify all offline registers are fully synchronized.",
          my: "သတ်မှတ်အရေအတွက်ထက် လျော့နည်းနေသော ပစ္စည်းများနှင့် အော့ဖ်လိုင်းဒေတာ ချိန်ညှိမှုအခြေအနေကို စစ်ဆေးပါ။",
          th: "ตรวจสอบรายการสินค้าที่ต่ำกว่าเกณฑ์ปลอดภัยและสถานะการซิงค์ข้อมูลของทุกเครื่อง.",
        },
      },
    ],
    proTip: {
      en: "Bookmark this page or set it as your default landing page in Settings > Application to review your shop's health every morning.",
      my: "ဆက်တင်များ > Application တွင် ဤဒက်ရှ်ဘုတ်ကို မူလဖွင့်လှစ်မည့် စာမျက်နှာအဖြစ် သတ်မှတ်ထားနိုင်ပါသည်။",
      th: "ตั้งหน้านี้เป็นหน้าเริ่มต้นใน การตั้งค่า > แอปพลิเคชัน เพื่อตรวจสอบสุขภาพของร้านค้าได้ทุกเช้า.",
    },
  },

  // 2. POS Mini
  {
    id: "pos-mini",
    route: "/pos",
    icon: "cart",
    category: "overview",
    posComplexityLevel: "MINI",
    screenshot: "/guide-screenshots/pos-mini.png",
    title: {
      en: "Point of Sale (POS Mini Mode) - High-Speed Cashier",
      my: "အရောင်းကောင်တာ (POS Mini မုဒ်) - လျင်မြန်သော အရောင်းစနစ်",
      th: "จุดขายหน้าร้าน (โหมด POS Mini) - แคชเชียร์ด่วน",
    },
    badge: {
      en: "POS Mini Mode",
      my: "POS Mini မုဒ်သီးသန့်",
      th: "เฉพาะโหมด POS Mini",
    },
    description: {
      en: "Fast, single-tap checkout designed for quick-service retail, cafes, and kiosks. Minimal clutter, barcode scanning, and instant cash settlement.",
      my: "လက်ဖက်ရည်ဆိုင်၊ ကော်ဖီဆိုင်နှင့် အမြန်အရောင်းဆိုင်များအတွက် အထူးသင့်လျော်သော တစ်ချက်နှိပ်ရုံဖြင့် ချက်ချင်းငွေချေနိုင်သည့် အရောင်းစနစ်။",
      th: "การคิดเงินที่รวดเร็ว เหมาะสำหรับร้านอาหาร คาเฟ่ และร้านค้าขนาดเล็ก แตะเพียงครั้งเดียวพร้อมรับเงินสดได้ทันที.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Quick Search & Barcode Input",
          my: "ဘားကုဒ်ဖတ်ခြင်း သို့မဟုတ် အမြန်ရှာဖွေခြင်း",
          th: "สแกนบาร์โค้ดหรือค้นหาด่วน",
        },
        desc: {
          en: "Focus the search bar (press F2) or scan any product barcode using a handheld scanner for instant cart addition.",
          my: "F2 ခလုတ်နှိပ်၍ အမည်ရိုက်ထည့်ပါ သို့မဟုတ် ဘားကုဒ်စကင်နာဖြင့် ဖတ်ရုံဖြင့် ခြင်းတောင်းထဲသို့ ချက်ချင်းရောက်ရှိမည်။",
          th: "กด F2 เพื่อพิมพ์ค้นหา หรือยิงบาร์โค้ดสินค้าเพื่อเพิ่มลงตะกร้าทันที.",
        },
      },
      {
        number: 2,
        label: {
          en: "Single-Tap Product Grid",
          my: "တစ်ချက်နှိပ် ရွေးချယ်နိုင်သော ပစ္စည်းကတ်များ",
          th: "ตารางสินค้าแตะครั้งเดียว",
        },
        desc: {
          en: "Large touch-friendly product buttons allow cashiers to add popular items to the cart with one tap.",
          my: "အရောင်းရဆုံး ပစ္စည်းများကို မျက်နှာပြင်ပေါ်တွင် တစ်ချက်နှိပ်ရုံဖြင့် အရေအတွက် တိုးမြှင့်ရောင်းချနိုင်ပါသည်။",
          th: "ปุ่มสินค้าขนาดใหญ่ ช่วยให้แคชเชียร์แตะเพิ่มสินค้าขายดีได้อย่างรวดเร็ว.",
        },
      },
      {
        number: 3,
        label: {
          en: "Live Cart Ticket Summary",
          my: "လက်ရှိ ခြင်းတောင်း အကျဉ်းချုပ်",
          th: "สรุปรายการในตะกร้า",
        },
        desc: {
          en: "Review item quantities, prices, and subtotal dynamically calculated without page reload.",
          my: "ရွေးချယ်ထားသော ပစ္စည်းများ၊ အရေအတွက်နှင့် ကျသင့်ငွေကို မျက်နှာပြင်တွင် ရှင်းလင်းစွာ ကြည့်ရှုနိုင်ပါသည်။",
          th: "ตรวจสอบรายการสินค้า จำนวน และยอดรวมที่คำนวณแบบเรียลไทม์.",
        },
      },
      {
        number: 4,
        label: {
          en: "Instant Preset Cash Checkout",
          my: "ငွေသားပမာဏ ရွေးချယ်၍ အမြန်ငွေချေခြင်း",
          th: "ปุ่มรับเงินสดด่วน",
        },
        desc: {
          en: "Tap quick cash tender amounts ($10, $20) or click 'Exact Cash Checkout' to complete the transaction in under 2 seconds.",
          my: "အလွယ်တကူ သတ်မှတ်ထားသော ငွေသားခလုတ်များကို နှိပ်၍ ၂ စက္ကန့်အတွင်း အရောင်းပြီးစီးအောင် ပြုလုပ်နိုင်ပါသည်။",
          th: "แตะปุ่มจำนวนเงินสดสำเร็จรูป หรือเลือกจ่ายพอดี เพื่อจบการขายได้ในเวลาไม่ถึง 2 วินาที.",
        },
      },
    ],
    proTip: {
      en: "In Mini mode, stock barcode tagging and variant matrix setups are skipped to give you the fastest possible counter speed.",
      my: "Mini မုဒ်တွင် ရှုပ်ထွေးသော အဆင့်များကို ကျော်လွှားထားသဖြင့် အလျင်မြန်ဆုံး အရောင်းသွက်စေပါသည်။",
      th: "ในโหมด Mini จะตัดความซับซ้อนของบาร์โค้ดรายชิ้นและตัวเลือกย่อยออก เพื่อความเร็วในการคิดเงินสูงสุด.",
    },
    shortcutHint: "Press F2 to focus scanner, Space to exact pay",
  },

  // 3. POS Simple
  {
    id: "pos-simple",
    route: "/pos",
    icon: "cart",
    category: "overview",
    posComplexityLevel: "SIMPLE",
    screenshot: "/guide-screenshots/pos-simple.png",
    title: {
      en: "Point of Sale (POS Simple Mode) - Retail Cashier",
      my: "အရောင်းကောင်တာ (POS Simple မုဒ်) - လက်လီအရောင်းစနစ်",
      th: "จุดขายหน้าร้าน (โหมด POS Simple) - แคชเชียร์ค้าปลีก",
    },
    badge: {
      en: "POS Simple Mode",
      my: "POS Simple မုဒ်သီးသန့်",
      th: "เฉพาะโหมด POS Simple",
    },
    description: {
      en: "Balanced POS register with multi-category navigation, unit conversions, customer credit selection, and multi-tender splits (Cash, Card, QR Pay).",
      my: "အမျိုးအစားအလိုက် ပစ္စည်းရှာဖွေခြင်း၊ ယူနစ်ပြောင်းလဲခြင်း၊ ဖောက်သည်အကြွေးမှတ်ခြင်းနှင့် ငွေပေးချေမှုပုံစံစုံ (ငွေသား၊ ကတ်၊ QR) အသုံးပြုနိုင်သော စနစ်။",
      th: "ระบบขายหน้าร้านสมดุล เลือกหมวดหมู่สินค้า แปลงหน่วยนับ เลือกลูกค้าเงินเชื่อ และรองรับการชำระเงินหลายช่องทาง.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Category Filter & Visual Search",
          my: "အမျိုးအစားအလိုက် စစ်ထုတ်ခြင်းနှင့် ရှာဖွေခြင်း",
          th: "กรองหมวดหมู่และค้นหาด้วยภาพ",
        },
        desc: {
          en: "Navigate tabs or filter by category to rapidly discover products. Color-coded stock badges indicate real-time store availability.",
          my: "ကုန်ပစ္စည်းအမျိုးအစား တက်ဘ်များကို နှိပ်၍ အမြန်ရှာဖွေပါ။ ကုန်လက်ကျန် အရေအတွက်ကိုလည်း တိုက်ရိုက်တွေ့မြင်နိုင်ပါသည်။",
          th: "สลับแท็บหมวดหมู่เพื่อค้นหาสินค้า ป้ายสีกำกับจะแสดงจำนวนสินค้าคงเหลือในร้านทันที.",
        },
      },
      {
        number: 2,
        label: {
          en: "Unit Measurement & Variant Options",
          my: "ရောင်းချမည့် ယူနစ်နှင့် အမျိုးအစား ရွေးချယ်ခြင်း",
          th: "เลือกหน่วยนับและตัวเลือกสินค้า",
        },
        desc: {
          en: "Sell by Box, Pack, or Piece. The system dynamically updates unit prices based on configured conversion ratios.",
          my: "ဖာလိုက်၊ ကတ်လိုက် သို့မဟုတ် တစ်ခုချင်း ရောင်းချနိုင်ပြီး ယူနစ်အလိုက် စျေးနှုန်းကို စနစ်က အလိုအလျောက် တွက်ချက်ပေးပါသည်။",
          th: "ขายเป็นลัง กล่อง หรือชิ้น ระบบจะคำนวณราคาตามอัตราส่วนการแปลงหน่วยให้อัตโนมัติ.",
        },
      },
      {
        number: 3,
        label: {
          en: "Customer Linking & Order Customization",
          my: "ဖောက်သည်ရွေးချယ်ခြင်းနှင့် အသေးစိတ် သတ်မှတ်ခြင်း",
          th: "ผูกข้อมูลลูกค้าและตั้งค่าคำสั่งซื้อ",
        },
        desc: {
          en: "Attach an existing customer or open 'Add more detail' to set delivery logistics, manual discounts, and order notes.",
          my: "ဖောက်သည်ကို ချိတ်ဆက်ပါ သို့မဟုတ် ပို့ဆောင်ရေး၊ လျှော့စျေးနှင့် မှတ်ချက်များ ထည့်သွင်းရန် 'Add more detail' ကို နှိပ်ပါ။",
          th: "เลือกลูกค้าประจำ หรือกด 'Add more detail' เพื่อระบุการจัดส่ง ส่วนลดพิเศษ และบันทึกข้อความ.",
        },
      },
      {
        number: 4,
        label: {
          en: "Multi-Tender Payment & Auto-Print",
          my: "ငွေချေနည်းလမ်းစုံနှင့် ပြေစာ အလိုအလျောက် ထုတ်ခြင်း",
          th: "ชำระเงินหลายรูปแบบและพิมพ์ใบเสร็จ",
        },
        desc: {
          en: "Accept combined payments (e.g. partial cash + KBZPay QR) and automatically trigger ESC/POS receipt printing.",
          my: "ငွေသားနှင့် ဒစ်ဂျစ်တယ်ငွေချေမှုများ ပေါင်းစပ်လက်ခံပြီး အပူပေးပြေစာကို စက်မှ အလိုအလျောက် ထုတ်ပေးမည်။",
          th: "รับชำระเงินแบบผสม (เงินสด + คิวอาร์โค้ด) พร้อมสั่งพิมพ์ใบเสร็จความร้อนอัตโนมัติ.",
        },
      },
    ],
    proTip: {
      en: "Press Enter or Spacebar on the payment screen to immediately confirm exact cash tendered without using the mouse.",
      my: "ငွေချေသည့် မျက်နှာပြင်တွင် Enter သို့မဟုတ် Spacebar နှိပ်ရုံဖြင့် မောက်စ်မလိုဘဲ ငွေသားအတိအကျ ရောင်းချနိုင်ပါသည်။",
      th: "กดปุ่ม Enter หรือ Spacebar ในหน้าชำระเงินเพื่อยืนยันการรับเงินสดพอดีโดยไม่ต้องจับเมาส์.",
    },
    shortcutHint: "Press Enter to finalize checkout",
  },

  // 4. POS Complex
  {
    id: "pos-complex",
    route: "/pos",
    icon: "cart",
    category: "overview",
    posComplexityLevel: "COMPLEX",
    screenshot: "/guide-screenshots/pos-complex.png",
    title: {
      en: "Point of Sale (POS Complex Mode) - Enterprise Terminal",
      my: "အရောင်းကောင်တာ (POS Complex မုဒ်) - လုပ်ငန်းကြီးများသုံး အရောင်းစနစ်",
      th: "จุดขายหน้าร้าน (โหมด POS Complex) - เทอร์มินัลระดับองค์กร",
    },
    badge: {
      en: "POS Complex Mode",
      my: "POS Complex မုဒ်သီးသန့်",
      th: "เฉพาะโหมด POS Complex",
    },
    description: {
      en: "Enterprise checkout terminal featuring multi-tier pricing, warranty and serial tracking, multi-warehouse stock allocations, and custom attribute matrix.",
      my: "လက်ကား/လက်လီ အဆင့်လိုက် စျေးနှုန်းများ၊ အာမခံနံပါတ်နှင့် စီရီရယ်နံပါတ်များ စစ်ဆေးခြင်း၊ ဂိုဒေါင်ပေါင်းစုံ ကုန်ပစ္စည်း ခွဲဝေရောင်းချခြင်း ပါဝင်သော စနစ်။",
      th: "เทอร์มินัลระดับองค์กร รองรับราคาหลายระดับตามกลุ่มลูกค้า ติดตามประกันและซีเรียลนัมเบอร์ และตัดสต็อกแยกคลังสินค้า.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Customer Tier & Pricing Auto-Detection",
          my: "ဖောက်သည်အဆင့်နှင့် လက်ကားစျေးနှုန်း အလိုအလျောက်ပြောင်းခြင်း",
          th: "ตรวจจับกลุ่มลูกค้าและปรับราคาตามระดับ",
        },
        desc: {
          en: "Selecting a customer automatically updates all cart item prices to their assigned pricing tier (VIP, Wholesale, Contractor).",
          my: "ဖောက်သည်ကို ရွေးချယ်လိုက်သည်နှင့် ၎င်းတို့၏ လက်ကား သို့မဟုတ် VIP စျေးနှုန်းများသို့ အလိုအလျောက် ပြောင်းလဲသွားမည်။",
          th: "เมื่อเลือกลูกค้า ระบบจะปรับราคาสินค้าในตะกร้าเป็นราคาขายส่งหรือราคาสมาชิก VIP ให้อัตโนมัติ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Serial / IMEI Number Verification",
          my: "စီရီရယ်နံပါတ် သို့မဟုတ် IMEI စစ်ဆေးခြင်း",
          th: "ตรวจสอบหมายเลขประจำเครื่อง (Serial/IMEI)",
        },
        desc: {
          en: "For serialized electronics or high-value parts, prompt cashiers to scan or record individual tracking numbers before sale.",
          my: "ဖုန်းနှင့် အီလက်ထရွန်းနစ်ပစ္စည်းများအတွက် IMEI သို့မဟုတ် စီရီရယ်နံပါတ်ကို အရောင်းမပြီးမီ စကင်ဖတ်ထည့်သွင်းပါ။",
          th: "สำหรับสินค้าอิเล็กทรอนิกส์หรือชิ้นส่วนสำคัญ ระบบจะให้ยิงบาร์โค้ดซีเรียลนัมเบอร์เพื่อเปิดประกันสินค้า.",
        },
      },
      {
        number: 3,
        label: {
          en: "Multi-Warehouse Fulfillment Allocation",
          my: "ဂိုဒေါင်ပေါင်းစုံမှ ပစ္စည်းထုတ်ယူမှု သတ်မှတ်ခြင်း",
          th: "กำหนดคลังสินค้าที่ต้องการตัดจ่าย",
        },
        desc: {
          en: "Specify which store branch or backroom warehouse depletes inventory for each order line item.",
          my: "မည်သည့် ဂိုဒေါင် သို့မဟုတ် ဆိုင်ခွဲမှ ပစ္စည်းထုတ်ယူရောင်းချမည်ကို စာရင်းတစ်ခုချင်းအလိုက် သတ်မှတ်နိုင်ပါသည်။",
          th: "เลือกคลังสินค้าต้นทางในการตัดสต็อกสำหรับแต่ละรายการสินค้าในใบเสร็จ.",
        },
      },
      {
        number: 4,
        label: {
          en: "Credit Terms, Invoicing & Split Settlement",
          my: "အကြွေးစနစ်၊ ငွေတောင်းခံလွှာနှင့် အရစ်ကျငွေချေမှု",
          th: "ให้สินเชื่อเงินเชื่อ ออกใบแจ้งหนี้ และแบ่งชำระ",
        },
        desc: {
          en: "Issue official tax invoices, assign 30-day net payment terms within customer credit limits, or split across payment methods.",
          my: "အခွန်ပြေစာ ထုတ်ပေးခြင်း၊ ရက် ၃၀ အကြွေးသတ်မှတ်ချက်ပေးခြင်းနှင့် ငွေချေနည်းလမ်းပေါင်းစုံ ခွဲခြားလက်ခံခြင်းများ ပြုလုပ်ပါ။",
          th: "เปิดใบกำกับภาษี กำหนดเครดิตเทอม 30 วันตามวงเงินลูกค้า และแบ่งจ่ายหลายช่องทางพร้อมกัน.",
        },
      },
    ],
    proTip: {
      en: "Complex mode is fully compatible with offline SQLite cache; serial lookups and tax rules work without active internet connectivity.",
      my: "Complex မုဒ်သည် အင်တာနက်လိုင်းမရှိချိန်တွင်လည်း စီရီရယ်နံပါတ်စစ်ဆေးခြင်းနှင့် အခွန်တွက်ချက်မှုများကို အပြည့်အဝ လုပ်ဆောင်နိုင်ပါသည်။",
      th: "โหมด Complex ทำงานร่วมกับระบบออฟไลน์ในเครื่องได้สมบูรณ์ การตรวจซีเรียลและภาษียังทำงานได้แม้ไม่มีเน็ต.",
    },
    shortcutHint: "F4 to switch customer tier, F9 for split pay",
  },

  // 5. POS Checkout Modal
  {
    id: "pos-checkout-modal",
    route: "/pos",
    icon: "receipt",
    category: "overview",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/pos-checkout-modal.png",
    title: {
      en: "POS Order Customization & Checkout Details Modal",
      my: "အရောင်းအော်ဒါ အသေးစိတ် ပြင်ဆင်ချက်နှင့် ငွေချေမှု ပေါ့ပ်အပ်",
      th: "หน้าต่างปรับแต่งคำสั่งซื้อและรายละเอียดการชำระเงิน POS",
    },
    badge: {
      en: "Checkout Dialog",
      my: "ငွေချေမှု မျက်နှာပြင်",
      th: "กล่องข้อความชำระเงิน",
    },
    description: {
      en: "In-depth order configuration modal accessed via 'Add more detail' in POS cart. Configure customer profile, courier delivery service, manual percentage discounts, and order notes.",
      my: "POS ခြင်းတောင်းရှိ 'Add more detail' မှတစ်ဆင့် ဖွင့်နိုင်သော အော်ဒါအသေးစိတ် ပေါ့ပ်အပ်။ ဖောက်သည်၊ ပို့ဆောင်ရေး အမြန်ချောပို့၊ လက်ဖြင့် လျှော့စျေးနှင့် မှတ်ချက်များ ထည့်သွင်းနိုင်ပါသည်။",
      th: "หน้าต่างตั้งค่าคำสั่งซื้อขั้นสูง เปิดได้จากปุ่ม 'Add more detail' ในตะกร้าสินค้า สำหรับผูกลูกค้า เลือกระบบขนส่ง ใส่ส่วนลดพิเศษ และโน้ตคำสั่งซื้อ.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Customer Identification & Credit Check",
          my: "ဖောက်သည်ရွေးချယ်ခြင်းနှင့် အကြွေးကန့်သတ်ချက် စစ်ဆေးခြင်း",
          th: "ระบุตัวตนลูกค้าและตรวจสอบวงเงินสินเชื่อ",
        },
        desc: {
          en: "Search customer by phone or name to view their credit balance, accrued loyalty points, and purchase history.",
          my: "ဖုန်းနံပါတ် သို့မဟုတ် အမည်ဖြင့် ရှာဖွေပြီး ဖောက်သည်၏ လက်ကျန်အကြွေးနှင့် ရမှတ်များကို စစ်ဆေးပါ။",
          th: "ค้นหาลูกค้าด้วยเบอร์โทรหรือชื่อ เพื่อดูยอดเครดิตคงเหลือ คะแนนสะสม และประวัติการซื้อ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Delivery Provider & Courier Notes",
          my: "ပို့ဆောင်ရေး ကုမ္ပဏီနှင့် လိပ်စာ မှတ်ချက်",
          th: "เลือกผู้ให้บริการขนส่งและระบุที่อยู่",
        },
        desc: {
          en: "Select courier service (e.g. Royal Express, Kerry, Store Delivery) and input tracking reference and recipient address.",
          my: "ချောပို့လုပ်ငန်း ရွေးချယ်ပြီး ခြေရာခံနံပါတ်နှင့် ပို့ဆောင်ရမည့် လိပ်စာ အသေးစိတ်ကို ရိုက်ထည့်ပါ။",
          th: "เลือกบริษัทขนส่ง พร้อมกรอกหมายเลขพัสดุและที่อยู่จัดส่งปลายทางอย่างละเอียด.",
        },
      },
      {
        number: 3,
        label: {
          en: "Manual Discount & Special Promotions",
          my: "လက်ဖြင့် လျှော့စျေးနှင့် အထူးပရိုမိုးရှင်း",
          th: "ใส่ส่วนลดพิเศษและโปรโมชันเฉพาะกิจ",
        },
        desc: {
          en: "Apply authorized percentage or flat cash discount directly to the entire order ticket with audit trail logging.",
          my: "ရာခိုင်နှုန်း သို့မဟုတ် ငွေသားပမာဏ လျှော့စျေးကို တိုက်ရိုက်သတ်မှတ်ပေးနိုင်ပြီး စာရင်းတွင် သက်သေအဖြစ် မှတ်သားထားမည်။",
          th: "ใส่ส่วนลดเป็นเปอร์เซ็นต์หรือจำนวนเงินสด พร้อมเก็บบันทึกประวัติเพื่อความโปร่งใส.",
        },
      },
      {
        number: 4,
        label: {
          en: "Save Order Options & Confirm",
          my: "ပြင်ဆင်ချက်များ သိမ်းဆည်း၍ အတည်ပြုခြင်း",
          th: "บันทึกข้อมูลและยืนยันเพื่อคิดเงิน",
        },
        desc: {
          en: "Click 'Save Options' to apply changes immediately to the active cashier ticket before final tender.",
          my: "ငွေမချေမီ ပြင်ဆင်ချက်များကို ခြင်းတောင်းထဲသို့ ထည့်သွင်းရန် 'Save Options' ခလုတ်ကို နှိပ်ပါ။",
          th: "กดปุ่ม 'Save Options' เพื่อนำการตั้งค่าทั้งหมดไปปรับยอดในตะกร้าก่อนรับเงิน.",
        },
      },
    ],
    proTip: {
      en: "Setting a delivery courier automatically marks the sale order with a pending dispatch flag in the Deliveries operational ledger.",
      my: "ပို့ဆောင်ရေး ချောပို့ကို ရွေးချယ်လိုက်ပါက Deliveries စာရင်းတွင် ပို့ဆောင်ရန် ကျန်ရှိနေသည့် အော်ဒါအဖြစ် အလိုအလျောက် သတ်မှတ်ပေးပါသည်။",
      th: "การเลือกบริษัทขนส่งจะส่งข้อมูลไปยังหน้า Deliveries เพื่อให้ทีมจัดส่งพิมพ์ใบปะหน้าพัสดุได้ทันที.",
    },
  },

  // 6. Products Catalog
  {
    id: "catalog-products",
    route: "/products",
    icon: "package",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/catalog-products.png",
    title: {
      en: "Product Inventory Catalog - Stock & Pricing Directory",
      my: "ကုန်ပစ္စည်း စာရင်းချုပ် - ပစ္စည်းနှင့် စျေးနှုန်းလမ်းညွှန်",
      th: "แคตตาล็อกสินค้า - รายการสินค้าและราคาขาย",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Central merchandise registry showing SKUs, barcodes, on-hand stock quantities, default selling units, and quick-filter category badges.",
      my: "SKU ကုဒ်၊ ဘားကုဒ်၊ လက်ကျန်စာရင်း၊ မူလရောင်းချသည့် ယူနစ်နှင့် အမျိုးအစားအလိုက် စစ်ထုတ်ကြည့်ရှုနိုင်သော ကုန်ပစ္စည်းလမ်းညွှန်။",
      th: "ศูนย์รวมรายการสินค้า แสดงรหัส SKU บาร์โค้ด จำนวนสต็อกคงเหลือ หน่วยขายหลัก และปุ่มกรองหมวดหมู่ด่วน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Instant Keyword & SKU Search",
          my: "အမည် သို့မဟုတ် SKU ဖြင့် အမြန်ရှာဖွေခြင်း",
          th: "ค้นหาด่วนด้วยชื่อหรือรหัส SKU",
        },
        desc: {
          en: "Filter hundreds of catalog items instantly by typing name, brand, SKU code, or scanning a barcode.",
          my: "အမည်၊ တံဆိပ်၊ SKU ကုဒ် သို့မဟုတ် ဘားကုဒ်စကင်ဖတ်၍ ကုန်ပစ္စည်း ရာပေါင်းများစွာကို ချက်ချင်း ရှာဖွေပါ။",
          th: "พิมพ์ชื่อสินค้า แบรนด์ รหัส SKU หรือยิงบาร์โค้ดเพื่อค้นหาสินค้าที่ต้องการได้ทันที.",
        },
      },
      {
        number: 2,
        label: {
          en: "On-Hand Stock & Safety Levels",
          my: "လက်ကျန်အရေအတွက်နှင့် အနိမ့်ဆုံးသတ်မှတ်ချက်",
          th: "ตรวจสต็อกคงเหลือและจุดสั่งซื้อซ้ำ",
        },
        desc: {
          en: "Review real-time total quantities across primary warehouses. Warning colors indicate products near depletion.",
          my: "ဂိုဒေါင်များရှိ စုစုပေါင်း ကုန်လက်ကျန်ကို စစ်ဆေးပါ။ အရောင်ပြောင်း သတိပေးချက်များဖြင့် ပစ္စည်းပြတ်လပ်မှုကို ကာကွယ်ပါ။",
          th: "ดูจำนวนคงเหลือจริงในทุกคลังสินค้า ป้ายเตือนสีส้ม/แดงจะแจ้งเตือนเมื่อสินค้าใกล้หมด.",
        },
      },
      {
        number: 3,
        label: {
          en: "Create New Product (+ Add)",
          my: "ကုန်ပစ္စည်းအသစ် ထည့်သွင်းခြင်း (+ Add)",
          th: "สร้างสินค้าใหม่ (+ Add)",
        },
        desc: {
          en: "Click the '+ Add' button in the page header to open the complete product creation form with unit ratios.",
          my: "စာမျက်နှာထိပ်ရှိ '+ Add' ခလုတ်ကို နှိပ်၍ ယူနစ်အချိုးအစားများပါဝင်သော ကုန်ပစ္စည်းအသစ်ဖောင်ကို ဖွင့်ပါ။",
          th: "กดปุ่ม '+ Add' ที่หัวหน้าเว็บเพื่อเปิดแบบฟอร์มสร้างสินค้าใหม่พร้อมกำหนดหน่วยนับ.",
        },
      },
      {
        number: 4,
        label: {
          en: "Row Action Menu & Edit",
          my: "စာရင်း အသေးစိတ် ပြင်ဆင်ခြင်း",
          th: "เมนูจัดการรายการและแก้ไข",
        },
        desc: {
          en: "Click any product row or the action menu to modify sales prices, upload images, or archive discontinued items.",
          my: "ရောင်းစျေးပြင်ခြင်း၊ ဓာတ်ပုံတင်ခြင်း သို့မဟုတ် အရောင်းရပ်နားခြင်းများ ပြုလုပ်ရန် စာရင်းကြောင်းကို နှိပ်ပါ။",
          th: "คลิกที่แถวสินค้าเพื่อแก้ไขราคาขาย อัปโหลดรูปภาพ หรือยกเลิกการจำหน่าย.",
        },
      },
    ],
    proTip: {
      en: "Products marked with 'Low Stock' will trigger immediate reorder reminders on the Dashboard (Today) operations hub.",
      my: "'Low Stock' အဆင့်ရှိ ပစ္စည်းများကို Dashboard တွင် အလိုအလျောက် သတိပေးဖော်ပြပေးမည်ဖြစ်ပါသည်။",
      th: "สินค้าที่ขึ้นสถานะ 'Low Stock' จะแสดงเตือนบนหน้า Dashboard (วันนี้) เพื่อให้สั่งซื้อได้ทันท่วงที.",
    },
  },

  // 7. Product Create Modal
  {
    id: "product-create",
    route: "/products",
    icon: "plus",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/product-create.png",
    title: {
      en: "Product Creation & Unit Attachments Modal",
      my: "ကုန်ပစ္စည်း အသစ်ဖန်တီးခြင်းနှင့် ယူနစ်သတ်မှတ်ခြင်း ပေါ့ပ်အပ်",
      th: "หน้าต่างสร้างสินค้าใหม่และผูกหน่วยนับ",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "အသစ်ထည့်သွင်းမှု မျက်နှာပြင်",
      th: "แบบฟอร์มบันทึกข้อมูล",
    },
    description: {
      en: "Comprehensive creation dialog to register product definitions: title, category, brand, SKU, barcode, unit conversion ratios, default purchase cost, and retail price.",
      my: "ကုန်ပစ္စည်း အမည်၊ အမျိုးအစား၊ တံဆိပ်၊ SKU၊ ဘားကုဒ်၊ ယူနစ်အချိုးအစား၊ ဝယ်ရင်းစျေးနှင့် ရောင်းစျေးများကို အပြည့်အစုံ ထည့်သွင်းနိုင်သော ပေါ့ပ်အပ်။",
      th: "หน้าต่างบันทึกข้อมูลสินค้าอย่างละเอียด: ชื่อสินค้า หมวดหมู่ แบรนด์ SKU บาร์โค้ด อัตราส่วนหน่วยนับ ต้นทุน และราคาขายปลีก.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Basic Identity & Barcode Assignment",
          my: "အခြေခံအချက်အလက်နှင့် ဘားကုဒ် ထည့်သွင်းခြင်း",
          th: "ข้อมูลพื้นฐานและกำหนดบาร์โค้ด",
        },
        desc: {
          en: "Input the official product title, assign an internal SKU, and scan the physical manufacturer barcode directly.",
          my: "ကုန်ပစ္စည်းအမည် အပြည့်အစုံ၊ ဆိုင်သုံး SKU ကုဒ်နှင့် ဘားကုဒ်နံပါတ်ကို စကင်ဖတ်ထည့်သွင်းပါ။",
          th: "กรอกชื่อสินค้า รหัส SKU ของร้าน และยิงสแกนบาร์โค้ดจากตัวสินค้าเพื่อบันทึกลงระบบ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Category & Brand Association",
          my: "အမျိုးအစားနှင့် တံဆိပ် ချိတ်ဆက်ခြင်း",
          th: "เลือกหมวดหมู่และตราสินค้า",
        },
        desc: {
          en: "Select the primary sales category and brand for clean POS touch-grid organization and reporting segmentation.",
          my: "POS အရောင်းမျက်နှာပြင်တွင် စနစ်တကျ ပြသနိုင်ရန် အမျိုးအစားနှင့် ကုန်ပစ္စည်းတံဆိပ်ကို ရွေးချယ်ပါ။",
          th: "เลือกหมวดหมู่และแบรนด์สินค้า เพื่อให้จัดเรียงบนหน้าจอ POS ได้อย่างเป็นระเบียบ.",
        },
      },
      {
        number: 3,
        label: {
          en: "Base Unit & Multi-Unit Ratio Definition",
          my: "အခြေခံယူနစ်နှင့် ရောင်းချမည့် ယူနစ်အချိုးများ သတ်မှတ်ခြင်း",
          th: "กำหนดหน่วยนับหลักและอัตราส่วนหน่วยย่อย",
        },
        desc: {
          en: "Set base inventory unit (e.g. Piece) and attach sales units (e.g. Box = 24 Pieces) with automatic pricing calculations.",
          my: "အခြေခံယူနစ် (ဥပမာ- တစ်ခု) သတ်မှတ်ပြီး ဖာလိုက် (၁ ဖာ = ၂၄ ခု) စသည့် ယူနစ်များကို စျေးနှုန်းနှင့်တကွ တွဲဖက်ပါ။",
          th: "ตั้งหน่วยหลัก (เช่น ชิ้น) และผูกหน่วยขายรอง (เช่น ลัง = 24 ชิ้น) พร้อมกำหนดราคาขายตามหน่วย.",
        },
      },
      {
        number: 4,
        label: {
          en: "Pricing & Safety Stock Thresholds",
          my: "စျေးနှုန်းများနှင့် အနိမ့်ဆုံး လက်ကျန်သတိပေးချက်",
          th: "ตั้งราคาขายและจำนวนสต็อกแจ้งเตือน",
        },
        desc: {
          en: "Enter standard retail price, cost price for FIFO margin calculation, and minimum reorder alert levels.",
          my: "ရောင်းစျေး၊ ဝယ်ရင်းစျေးနှင့် စတော့ပြတ်လပ်မှု သတိပေးမည့် အနိမ့်ဆုံး အရေအတွက်ကို သတ်မှတ်ပြီး သိမ်းဆည်းပါ။",
          th: "ระบุราคาขาย ต้นทุนมาตรฐานเพื่อคำนวณกำไร FIFO และระดับสต็อกขั้นต่ำที่ต้องแจ้งเตือน.",
        },
      },
    ],
    proTip: {
      en: "You can generate random unique barcodes automatically by leaving the barcode input blank and clicking the barcode generator button.",
      my: "ဘားကုဒ်မပါသော ပစ္စည်းများအတွက် ကွက်လပ်ထားခဲ့ပါက စနစ်မှ ဘားကုဒ်အသစ် အလိုအလျောက် ထုတ်ပေးမည်ဖြစ်ပါသည်။",
      th: "หากสินค้าไม่มีบาร์โค้ด ให้เว้นว่างไว้แล้วกดปุ่มสร้างบาร์โค้ด ระบบจะรันเลขอัตโนมัติให้ทันที.",
    },
  },

  // 8. Categories Management Modal
  {
    id: "categories-manage",
    route: "/categories",
    icon: "tag",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/categories-manage.png",
    title: {
      en: "Categories Directory & Hierarchy Management Modal",
      my: "ကုန်ပစ္စည်း အမျိုးအစားများ စီမံခန့်ခွဲမှု ပေါ့ပ်အပ်",
      th: "หน้าต่างจัดการหมวดหมู่สินค้าและโครงสร้างลำดับชั้น",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "အမျိုးအစား စီမံမှု",
      th: "จัดการหมวดหมู่",
    },
    description: {
      en: "Organize catalog taxonomy into parent and child categories. Assign POS grid display colors, icons, and category-level tax overrides.",
      my: "ကုန်ပစ္စည်းများကို အုပ်စုအလိုက် ခွဲခြားပါ။ POS မျက်နှာပြင်တွင် ဖော်ပြမည့် အရောင်များ၊ အိုင်ကွန်များနှင့် အခွန်ရာခိုင်နှုန်းများကို သတ်မှတ်နိုင်ပါသည်။",
      th: "จัดโครงสร้างหมวดหมู่สินค้าหลักและหมวดหมู่ย่อย กำหนดสีปุ่มบนหน้าจอ POS ไอคอน และอัตราภาษีประจำหมวดหมู่.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Category Name & Code Setup",
          my: "အမျိုးအစားအမည်နှင့် ကုဒ် ထည့်သွင်းခြင်း",
          th: "ตั้งชื่อหมวดหมู่และรหัสอ้างอิง",
        },
        desc: {
          en: "Define distinct names for display in both English, Myanmar, and Thai language interfaces.",
          my: "ဘာသာစကားအားလုံးတွင် ရှင်းလင်းစွာ မြင်တွေ့ရစေရန် အမျိုးအစားအမည်နှင့် ကုဒ်ကို ထည့်သွင်းပါ။",
          th: "กำหนดชื่อหมวดหมู่ให้ชัดเจน รองรับการแสดงผลทุกภาษาทั้ง อังกฤษ พม่า และไทย.",
        },
      },
      {
        number: 2,
        label: {
          en: "Parent Category Hierarchy",
          my: "ပင်မအမျိုးအစားနှင့် အုပ်စုခွဲ သတ်မှတ်ခြင်း",
          th: "จัดลำดับหมวดหมู่หลักและหมวดหมู่ย่อย",
        },
        desc: {
          en: "Nest subcategories under major departments (e.g., 'Beverages' -> 'Cold Drinks' -> 'Energy Drinks').",
          my: "အုပ်စုကြီးများအောက်တွင် အုပ်စုခွဲငယ်များကို အဆင့်ဆင့် သတ်မှတ်ချိတ်ဆက်နိုင်ပါသည်။",
          th: "สร้างหมวดหมู่ย่อยภายใต้หมวดหมู่หลัก (เช่น เครื่องดื่ม -> น้ำอัดลม -> เครื่องดื่มชูกำลัง).",
        },
      },
      {
        number: 3,
        label: {
          en: "POS Display Color & Sort Order",
          my: "POS တွင် ပြသမည့် အရောင်နှင့် အစဉ်လိုက်စီခြင်း",
          th: "เลือกสีปุ่ม POS และลำดับการแสดงผล",
        },
        desc: {
          en: "Assign visual color badges and sort priorities so high-frequency categories appear first on cashier screens.",
          my: "အရောင်းရဆုံး အုပ်စုများကို ရှေ့ဆုံးတွင် တွေ့ရစေရန် ဦးစားပေးအမှတ်နှင့် အရောင်များ သတ်မှတ်ပါ။",
          th: "กำหนดสีและลำดับความสำคัญ เพื่อให้หมวดหมู่ที่ขายบ่อยที่สุดแสดงเป็นลำดับแรกบนจอแคชเชียร์.",
        },
      },
      {
        number: 4,
        label: {
          en: "Save Category & Apply to Products",
          my: "သိမ်းဆည်း၍ ကုန်ပစ္စည်းများနှင့် ချိတ်ဆက်ခြင်း",
          th: "บันทึกหมวดหมู่และใช้งานกับสินค้า",
        },
        desc: {
          en: "Save changes to instantly update POS cashier navigation buttons without restarting the application.",
          my: "သိမ်းဆည်းလိုက်သည်နှင့် POS မျက်နှာပြင်ရှိ အမျိုးအစားခလုတ်များတွင် ချက်ချင်း အသက်ဝင်သွားပါမည်။",
          th: "กดบันทึกเพื่อให้ปุ่มหมวดหมู่บนหน้าจอ POS อัปเดตทันทีโดยไม่ต้องรีสตาร์ตระบบ.",
        },
      },
    ],
    proTip: {
      en: "Categorizing items properly enables segmented revenue and margin reports under the Insights > Reports module.",
      my: "အမျိုးအစားများကို စနစ်တကျ ခွဲခြားထားခြင်းဖြင့် Reports ကဏ္ဍတွင် အုပ်စုအလိုက် အမြတ်ငွေကို အသေးစိတ် ကြည့်ရှုနိုင်ပါသည်။",
      th: "การจัดหมวดหมู่อย่างเป็นระบบจะช่วยให้ดูรายงานยอดขายและกำไรแยกตามกลุ่มสินค้าในหน้า Reports ได้อย่างแม่นยำ.",
    },
  },

  // 9. Brands Management Modal
  {
    id: "brands-manage",
    route: "/brands",
    icon: "store",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/brands-manage.png",
    title: {
      en: "Brand Directory & Manufacturer Profiles Modal",
      my: "ကုန်အမှတ်တံဆိပ်များ စီမံခန့်ခွဲမှု ပေါ့ပ်အပ်",
      th: "หน้าต่างจัดการแบรนด์และข้อมูลผู้ผลิต",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "တံဆိပ် စီမံမှု",
      th: "จัดการแบรนด์",
    },
    description: {
      en: "Maintain verified manufacturer brands, official supplier contact links, logos, and warranty service partnership terms.",
      my: "စက်ရုံထုတ် တံဆိပ်များ၊ တရားဝင် ဖြန့်ချိသူများ၏ ဆက်သွယ်ရန်လိပ်စာ၊ လိုဂိုများနှင့် အာမခံဝန်ဆောင်မှု စာချုပ်များကို စီမံခန့်ခွဲပါ။",
      th: "จัดการแบรนด์สินค้า ข้อมูลติดต่อตัวแทนจำหน่าย โลโก้ และเงื่อนไขการรับประกันสินค้าของผู้ผลิต.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Brand Name & Manufacturer Profile",
          my: "တံဆိပ်အမည်နှင့် ထုတ်လုပ်သူ အချက်အလက်",
          th: "ระบุชื่อแบรนด์และข้อมูลผู้ผลิต",
        },
        desc: {
          en: "Record company brand names (e.g., Apple, Samsung, Bosch) and assign internal reference slugs.",
          my: "ကုမ္ပဏီ တံဆိပ်အမည်များနှင့် အတွင်းသုံး ရည်ညွှန်းကုဒ်များကို ရိုက်ထည့်ပါ။",
          th: "บันทึกชื่อแบรนด์อย่างเป็นทางการ (เช่น Apple, Samsung, Bosch) และกำหนดรหัสอ้างอิง.",
        },
      },
      {
        number: 2,
        label: {
          en: "Supplier & Warranty Contact Details",
          my: "ကုန်ပေးသွင်းသူနှင့် အာမခံဆက်သွယ်ရန် ဖုန်းနံပါတ်",
          th: "ข้อมูลติดต่อซัพพลายเออร์และศูนย์ประกัน",
        },
        desc: {
          en: "Store vendor support phone numbers and warranty RMA return addresses for fast workshop reference.",
          my: "ပစ္စည်းပြင်ဆင်ရေး စင်တာအတွက် လိုအပ်သော ဝန်ဆောင်မှု ဖုန်းနံပါတ်နှင့် ပစ္စည်းလဲလှယ်ရန် လိပ်စာများကို မှတ်သားပါ။",
          th: "บันทึกเบอร์โทรฝ่ายบริการและที่อยู่ส่งเคลมสินค้าเพื่อความสะดวกของช่างซ่อม.",
        },
      },
      {
        number: 3,
        label: {
          en: "Save Brand & Filter Catalog",
          my: "တံဆိပ် သိမ်းဆည်း၍ စာရင်းများ စစ်ထုတ်ခြင်း",
          th: "บันทึกแบรนด์และใช้กรองแคตตาล็อก",
        },
        desc: {
          en: "Confirm and save to enable immediate brand filtering across Products, Stock-In, and Repairs modules.",
          my: "သိမ်းဆည်းလိုက်သည်နှင့် ကုန်ပစ္စည်း၊ ပစ္စည်းအဝင်နှင့် ပြင်ဆင်မှုစာရင်းများတွင် တံဆိပ်အလိုက် စစ်ထုတ်နိုင်မည်။",
          th: "บันทึกข้อมูลเพื่อใช้กรองรายการสินค้า ทั้งในหน้าสินค้า คลัง และงานซ่อมได้ทันที.",
        },
      },
    ],
    proTip: {
      en: "In the repair workshop module, selecting an intake brand pre-populates authorized vendor warranty claims.",
      my: "ပစ္စည်းပြင်ဆင်မှု ကဏ္ဍတွင် တံဆိပ်ကို ရွေးချယ်ခြင်းဖြင့် အာမခံလျှောက်ထားမှုများကို ပိုမိုမြန်ဆန်စေပါသည်။",
      th: "ในระบบงานซ่อม การเลือกแบรนด์อุปกรณ์จะช่วยดึงข้อมูลเงื่อนไขการเคลมประกันของศูนย์มาให้โดยอัตโนมัติ.",
    },
  },

  // 10. Units Management Modal
  {
    id: "units-manage",
    route: "/units",
    icon: "box",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/units-manage.png",
    title: {
      en: "Units of Measure (UOM) Configuration Modal",
      my: "ကုန်သွယ်မှု ရေတွက်ပုံ ယူနစ်များ စီမံခန့်ခွဲမှု ပေါ့ပ်အပ်",
      th: "หน้าต่างตั้งค่าหน่วยนับสินค้า (UOM)",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "ယူနစ် သတ်မှတ်ချက်",
      th: "ตั้งค่าหน่วยนับ",
    },
    description: {
      en: "Define operational units of measure: Piece (pcs), Box (box), Kilogram (kg), Meter (m), and Carton (ctn) for multi-dimensional inventory accuracy.",
      my: "တစ်ခုချင်း (pcs)၊ ဖာ (box)၊ ကီလို (kg)၊ မီတာ (m) နှင့် ကတ်တွန် (ctn) စသည့် ရေတွက်ပုံ ယူနစ်များကို တိကျစွာ သတ်မှတ်နိုင်သော နေရာ။",
      th: "กำหนดหน่วยนับสินค้ามาตรฐาน: ชิ้น (pcs), กล่อง (box), กิโลกรัม (kg), เมตร (m), และลัง (ctn) เพื่อความแม่นยำในการคุมสต็อก.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Unit Code & Standard Symbol",
          my: "ယူနစ်ကုဒ်နှင့် သင်္ကေတ သတ်မှတ်ခြင်း",
          th: "กำหนดรหัสหน่วยและสัญลักษณ์ย่อ",
        },
        desc: {
          en: "Enter standard abbreviated codes (e.g. PCS, BOX, KG) printed on physical receipts and shelf labels.",
          my: "ပြေစာများနှင့် စင်တင်တံဆိပ်များတွင် ဖော်ပြမည့် ယူနစ်သင်္ကေတ (ဥပမာ- PCS, BOX, KG) ကို ထည့်သွင်းပါ။",
          th: "ระบุชื่อย่อมาตรฐาน (เช่น PCS, BOX, KG) ที่จะปรากฏบนใบเสร็จและป้ายราคาหน้าร้าน.",
        },
      },
      {
        number: 2,
        label: {
          en: "Measurement Type & Decimals Allowance",
          my: "အတိုင်းအတာအမျိုးအစားနှင့် ဒဿမကိန်း ခွင့်ပြုချက်",
          th: "ประเภทการวัดและการอนุญาตให้มีทศนิยม",
        },
        desc: {
          en: "Set whether fractional quantities are permitted (e.g., 1.50 kg allowed vs. whole integer items like phones).",
          my: "အလေးချိန်နှင့် အလျားအတွက် ဒဿမကိန်း (ဥပမာ ၁.၅ ကီလို) ရောင်းချခွင့် ရှိမရှိ ရွေးချယ်ပါ။",
          th: "ระบุว่าสินค้านี้ขายเป็นเศษทศนิยมได้หรือไม่ (เช่น ชั่งน้ำหนัก 1.5 กก. ได้ แต่โทรศัพท์ต้องเป็นจำนวนเต็ม).",
        },
      },
      {
        number: 3,
        label: {
          en: "Save Unit Definition",
          my: "ယူနစ် အတည်ပြု သိမ်းဆည်းခြင်း",
          th: "บันทึกหน่วยนับ",
        },
        desc: {
          en: "Click save to make the unit available across Product creation, Stock-In receiving, and POS cart checkout.",
          my: "သိမ်းဆည်းလိုက်သည်နှင့် ကုန်ပစ္စည်းအသစ်သွင်းခြင်း၊ ပစ္စည်းလက်ခံခြင်းနှင့် POS အရောင်းများတွင် အသုံးပြုနိုင်မည်။",
          th: "กดบันทึกเพื่อให้หน่วยนับนี้พร้อมใช้งานในหน้าสร้างสินค้า การรับของเข้าคลัง และการคิดเงินหน้าร้าน.",
        },
      },
    ],
    proTip: {
      en: "Always keep atomic units (e.g. Piece) as your base unit; bundle units (e.g. Carton) should be linked via Unit Conversions.",
      my: "အငယ်ဆုံး ရေတွက်ပုံယူနစ် (ဥပမာ တစ်ခုချင်း) ကို အခြေခံယူနစ်အဖြစ် ထားရှိပြီး အုပ်စုလိုက်ယူနစ်များကို Conversions တွင် ချိတ်ဆက်ပါ။",
      th: "ควรตั้งหน่วยที่เล็กที่สุด (เช่น ชิ้น) เป็นหน่วยหลักเสมอ แล้วจึงผูกหน่วยใหญ่ (เช่น ลัง) ในหน้าแปลงหน่วยนับ.",
    },
  },

  // 11. Unit Conversions Modal
  {
    id: "unit-conversions",
    route: "/units/conversions",
    icon: "swap",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/unit-conversions.png",
    title: {
      en: "Unit Conversion Ratios & Packaging Multipliers Modal",
      my: "ယူနစ် အချိုးအစားနှင့် ထုပ်ပိုးမှုပြောင်းလဲခြင်း ပေါ့ပ်အပ်",
      th: "หน้าต่างอัตราส่วนแปลงหน่วยนับและการบรรจุ",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "ယူနစ်အချိုး ပြောင်းလဲမှု",
      th: "แปลงหน่วยนับ",
    },
    description: {
      en: "Link multiple packaging sizes with mathematical multipliers (e.g. 1 Box = 12 Pieces, 1 Carton = 10 Boxes). Purchase in cartons, sell in pieces.",
      my: "ထုပ်ပိုးမှု အရွယ်အစားအလိုက် သင်္ချာနည်းကျ အချိုးများ သတ်မှတ်ပါ (ဥပမာ ၁ ဖာ = ၁၂ ခု၊ ၁ ကတ်တွန် = ၁၀ ဖာ)။ ဖာလိုက်ဝယ်ပြီး တစ်ခုချင်း ပြန်ရောင်းနိုင်ပါသည်။",
      th: "กำหนดอัตราส่วนการแปลงหน่วย (เช่น 1 กล่อง = 12 ชิ้น, 1 ลัง = 10 กล่อง) ช่วยให้รับของเข้าเป็นลังแต่ขายปลีกเป็นชิ้นได้ถูกต้อง.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Select From & To Units",
          my: "မူလယူနစ်နှင့် ပြောင်းလဲမည့် ယူနစ်ကို ရွေးချယ်ခြင်း",
          th: "เลือกหน่วยต้นทางและหน่วยปลายทาง",
        },
        desc: {
          en: "Choose the source packaging unit (e.g. Carton) and the target destination unit (e.g. Piece).",
          my: "ပြောင်းလဲလိုသော ယူနစ်ကြီး (ဥပမာ ကတ်တွန်) နှင့် ဦးတည်ယူနစ် (ဥပမာ တစ်ခုချင်း) ကို ရွေးချယ်ပါ။",
          th: "เลือกหน่วยบรรจุภัณฑ์ต้นทาง (เช่น ลัง) และหน่วยย่อยเป้าหมาย (เช่น ชิ้น).",
        },
      },
      {
        number: 2,
        label: {
          en: "Configure Conversion Ratio Multiplier",
          my: "အချိုးအစား မြှောက်ကိန်း သတ်မှတ်ခြင်း",
          th: "ใส่อัตราส่วนตัวคูณ",
        },
        desc: {
          en: "Enter the exact numeric quantity contained within one packaging unit (e.g., 24.000).",
          my: "ယူနစ်ကြီးတစ်ခုတွင် ပါဝင်သော အရေအတွက်အတိအကျ (ဥပမာ ၂၄ ခု) ကို ရိုက်ထည့်ပါ။",
          th: "กรอกจำนวนหน่วยย่อยที่บรรจุอยู่จริงใน 1 หน่วยใหญ่ (เช่น 24.000).",
        },
      },
      {
        number: 3,
        label: {
          en: "Save Conversion Formula",
          my: "ပြောင်းလဲမှု ဖော်မြူလာကို သိမ်းဆည်းခြင်း",
          th: "บันทึกสูตรการแปลงหน่วย",
        },
        desc: {
          en: "Confirm to apply conversion logic across purchase order receiving, POS auto-unbundling, and FIFO audit logs.",
          my: "အတည်ပြုသိမ်းဆည်းလိုက်ပါက ပစ္စည်းအဝင်၊ POS ရောင်းချမှုနှင့် ကုန်စာရင်းစစ်ဆေးမှုများတွင် အလိုအလျောက် တွက်ချက်ပေးမည်။",
          th: "ยืนยันการบันทึกเพื่อให้ระบบนำไปคำนวณตัดสต็อกและแปลงราคาขายบนหน้า POS โดยอัตโนมัติ.",
        },
      },
    ],
    proTip: {
      en: "Selling a box when you only have loose pieces in stock will automatically decrement 12 loose pieces without stock mismatch errors.",
      my: "သီးသန့်အိတ်များသာ လက်ကျန်ရှိချိန်တွင် ဖာလိုက်ရောင်းချပါက စနစ်က ၁၂ ခုကို အလိုအလျောက် နှုတ်ယူတွက်ချက်ပေးပါသည်။",
      th: "หากลูกค้าซื้อเป็นกล่องแต่ในร้านมีเศษชิ้น ระบบจะตัดยอด 12 ชิ้นให้โดยอัตโนมัติ ไม่เกิดปัญหาของติดลบ.",
    },
  },

  // 12. Catalog Attributes
  {
    id: "catalog-attributes",
    route: "/attributes",
    icon: "palette",
    category: "operations",
    posComplexityLevel: "COMPLEX",
    screenshot: "/guide-screenshots/catalog-attributes.png",
    title: {
      en: "Product Variant Matrix & Custom Attributes",
      my: "ပစ္စည်း အမျိုးကွဲများနှင့် ကိုယ်ပိုင် သတ်မှတ်ချက်များ",
      th: "คุณลักษณะสินค้าและเมทริกซ์ตัวเลือกย่อย",
    },
    badge: {
      en: "POS Complex Mode",
      my: "POS Complex သီးသန့်",
      th: "เฉพาะโหมด Complex",
    },
    description: {
      en: "Configure variant dimensions such as Color, Size, Storage Capacity, and Material. Generate multi-variant SKU combinations with custom pricing.",
      my: "အရောင်၊ ဆိုဒ်၊ မန်မိုရီပမာဏနှင့် ပစ္စည်းအမျိုးအစား စသည့် အမျိုးကွဲများကို ဖန်တီးပြီး SKU ကုဒ်များနှင့် စျေးနှုန်းများ ခွဲခြားသတ်မှတ်နိုင်သော နေရာ။",
      th: "ตั้งค่าตัวเลือกย่อยของสินค้า เช่น สี ขนาด ความจุ และวัสดุ พร้อมสร้างรหัส SKU แยกตามตัวเลือกและตั้งราคาต่างกันได้.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Attribute Key Creation",
          my: "အမျိုးကွဲ အဓိကအမည် သတ်မှတ်ခြင်း",
          th: "สร้างหัวข้อคุณลักษณะ",
        },
        desc: {
          en: "Create parent attribute keys (e.g. 'Storage', 'Color', 'T-Shirt Size').",
          my: "ပင်မ အမျိုးကွဲအမည် (ဥပမာ- 'မန်မိုရီ'၊ 'အရောင်'၊ 'ဆိုဒ်') ကို ဖန်တီးပါ။",
          th: "สร้างหัวข้อคุณลักษณะหลัก (เช่น 'ความจุ', 'สี', 'ขนาดเสื้อ').",
        },
      },
      {
        number: 2,
        label: {
          en: "Value Tags & Price Modifiers",
          my: "ရွေးချယ်စရာ တန်ဖိုးများနှင့် စျေးနှုန်းကွာခြားချက်",
          th: "กำหนดตัวเลือกย่อยและส่วนต่างราคา",
        },
        desc: {
          en: "Add specific options (128GB, 256GB, Red, XL) and define price deltas relative to the base model.",
          my: "ရွေးချယ်နိုင်သော တန်ဖိုးများ (128GB, 256GB, အနီရောင်, XL) ထည့်သွင်းပြီး စျေးနှုန်းကွာဟချက်ကို သတ်မှတ်ပါ။",
          th: "เพิ่มตัวเลือกย่อย (128GB, 256GB, สีแดง, XL) และระบุส่วนต่างราคาเมื่อเทียบกับรุ่นมาตรฐาน.",
        },
      },
      {
        number: 3,
        label: {
          en: "Assign Attributes to Product Classes",
          my: "ကုန်ပစ္စည်းအုပ်စုများနှင့် ချိတ်ဆက်ခြင်း",
          th: "ผูกคุณลักษณะเข้ากับกลุ่มสินค้า",
        },
        desc: {
          en: "Link the attribute group to relevant catalog products to generate matrix variants on cashier screens.",
          my: "ဆိုင်သုံး ကုန်ပစ္စည်းများနှင့် ချိတ်ဆက်လိုက်ပါက POS အရောင်းကောင်တာတွင် အလွယ်တကူ ရွေးချယ်နိုင်မည်။",
          th: "ผูกกลุ่มคุณลักษณะนี้กับสินค้าในระบบ เพื่อให้แคชเชียร์เลือกตัวเลือกได้สะดวกตอนคิดเงิน.",
        },
      },
    ],
    proTip: {
      en: "Each generated variant can have its own distinct barcode label printed for fast point-of-sale scanning.",
      my: "အမျိုးကွဲတစ်ခုချင်းစီအတွက် ကိုယ်ပိုင်သီးသန့် ဘားကုဒ်များ ထုတ်ပေးနိုင်သဖြင့် အရောင်းပိုမိုမြန်ဆန်စေပါသည်။",
      th: "สินค้าแต่ละตัวเลือกย่อยสามารถพิมพ์บาร์โค้ดเฉพาะตัวออกมาติด เพื่อให้ยิงสแกนขายได้รวดเร็ว.",
    },
  },

  // 13. Pricing Tiers
  {
    id: "pricing-tiers",
    route: "/pricing-tiers",
    icon: "tag",
    category: "operations",
    posComplexityLevel: "COMPLEX",
    screenshot: "/guide-screenshots/pricing-tiers.png",
    title: {
      en: "Wholesale & Customer Tiered Pricing Engine",
      my: "လက်ကားနှင့် အဆင့်လိုက် စျေးနှုန်းသတ်မှတ်မှု စနစ်",
      th: "ระบบราคาขายส่งและระดับราคาสมาชิก",
    },
    badge: {
      en: "POS Complex Mode",
      my: "POS Complex သီးသန့်",
      th: "เฉพาะโหมด Complex",
    },
    description: {
      en: "Set custom price levels for different customer segments: Retail, Wholesale, VIP, Contractor, and Distributor with volume discount rules.",
      my: "လက်လီ၊ လက်ကား၊ VIP ဖောက်သည်နှင့် ကန်ထရိုက်တာများအတွက် အဆင့်လိုက် စျေးနှုန်းများနှင့် အရေအတွက်အလိုက် လျှော့စျေး စည်းမျဉ်းများ သတ်မှတ်ပါ။",
      th: "ตั้งระดับราคาเฉพาะกลุ่มลูกค้า: ลูกค้าทั่วไป ขายส่ง สมาชิก VIP ผู้รับเหมา และตัวแทน พร้อมกฎส่วนลดตามจำนวนการสั่งซื้อ.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Define Pricing Tier Names",
          my: "စျေးနှုန်းအဆင့် အမည်များ ဖန်တီးခြင်း",
          th: "สร้างชื่อระดับราคา",
        },
        desc: {
          en: "Configure tier tiers (e.g. VIP Club: 10% off retail, Contractor: Cost + 15%).",
          my: "အဆင့်အမည်များ (ဥပမာ- VIP အသင်းဝင် ၁၀% လျှော့၊ ကန်ထရိုက်တာ ဝယ်ရင်း+၁၅%) သတ်မှတ်ပါ။",
          th: "กำหนดระดับราคา (เช่น สมาชิก VIP ลด 10%, ช่างรับเหมา คิดราคาต้นทุน + 15%).",
        },
      },
      {
        number: 2,
        label: {
          en: "Bulk Override Rules or Item-Level Pricing",
          my: "ပစ္စည်းအလိုက် စျေးနှုန်း သီးသန့် သတ်မှတ်ခြင်း",
          th: "กำหนดราคาเฉพาะรายชิ้นหรือลดทั้งกลุ่ม",
        },
        desc: {
          en: "Apply flat percentage discounts across whole categories or specify fixed dollar prices per product SKU.",
          my: "အမျိုးအစားတစ်ခုလုံးကို ရာခိုင်နှုန်းဖြင့် လျှော့ပေးနိုင်သလို ပစ္စည်းတစ်ခုချင်းအလိုက် သီးသန့် စျေးနှုန်းလည်း ပေးနိုင်ပါသည်။",
          th: "ตั้งส่วนลดเป็นเปอร์เซ็นต์ทั้งหมวดหมู่ หรือระบุราคาเงินสดสุทธิของสินค้าแต่ละรหัส SKU ได้ตามต้องการ.",
        },
      },
      {
        number: 3,
        label: {
          en: "Attach Tiers to Customer Accounts",
          my: "ဖောက်သည် အကောင့်များနှင့် စျေးနှုန်းအဆင့် ချိတ်ဆက်ခြင်း",
          th: "ผูกระดับราคากับบัญชีลูกค้า",
        },
        desc: {
          en: "Assign the pricing tier to customer profiles. In POS Complex mode, prices update automatically upon customer selection.",
          my: "ဖောက်သည်ပရိုဖိုင်တွင် ချိတ်ဆက်ထားပါက POS တွင် ဖောက်သည်ရွေးလိုက်သည်နှင့် စျေးနှုန်း အလိုအလျောက် ကျဆင်းသွားမည်။",
          th: "เลือกระดับราคาในโปรไฟล์ลูกค้า เมื่อแคชเชียร์เลือกลูกค้ารายนี้ ราคาสินค้าจะปรับเป็นราคาพิเศษทันที.",
        },
      },
    ],
    proTip: {
      en: "Tiered pricing takes precedence over general seasonal promotions, ensuring high-volume trade buyers always receive their negotiated rate.",
      my: "အဆင့်လိုက် စျေးနှုန်းများသည် အထွေထွေ ပရိုမိုးရှင်းထက် ဦးစားပေး အသက်ဝင်သဖြင့် လက်ကားဖောက်သည်များအတွက် အမြဲ မှန်ကန်စေပါသည်။",
      th: "ระบบราคาตามระดับสมาชิกจะได้รับความสำคัญก่อนโปรโมชันทั่วไป ช่วยให้ลูกค้าขายส่งได้ราคาตามที่ตกลงไว้เสมอ.",
    },
  },

  // 14. Stock In
  {
    id: "stock-in",
    route: "/stock/in",
    icon: "box",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/stock-in.png",
    title: {
      en: "Stock Inbound Receiving - Goods Received Note (GRN)",
      my: "ပစ္စည်းအဝင် လက်ခံစာရင်း - ကုန်ပစ္စည်းလက်ခံလွှာ (GRN)",
      th: "การรับสินค้าเข้าคลัง - ใบรับสินค้า (GRN)",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Receive incoming merchandise from vendors or factory shipments. Update inventory counts, record batch lot numbers, and capture landed unit purchase costs.",
      my: "ကုန်ပေးသွင်းသူများထံမှ ရောက်ရှိလာသော ပစ္စည်းများကို စာရင်းသွင်းပါ။ လက်ကျန်အရေအတွက် တိုးမြှင့်ခြင်း၊ အသုတ်နံပါတ်နှင့် ဝယ်ရင်းစျေးနှုန်းများ တိကျစွာ မှတ်တမ်းတင်ပါ။",
      th: "บันทึกรับสินค้าเข้าคลังจากซัพพลายเออร์ เพิ่มยอดสต็อกคงเหลือ บันทึกหมายเลขล็อต และลงราคาทุนจริงเพื่อคำนวณกำไร.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Vendor Invoice Reference & Warehouse Destination",
          my: "ကုန်ရောင်းသူ ပြေစာအမှတ်နှင့် သိုလှောင်မည့် ဂိုဒေါင်",
          th: "เลขอ้างอิงใบส่งของและคลังปลายทาง",
        },
        desc: {
          en: "Input supplier invoice reference code and choose the destination receiving warehouse location.",
          my: "ကုန်ပေးသွင်းသူ၏ ဘောက်ချာအမှတ်ကို ရိုက်ထည့်ပြီး ပစ္စည်းသိမ်းဆည်းမည့် ဂိုဒေါင်ကို ရွေးချယ်ပါ။",
          th: "กรอกเลขที่ใบกำกับภาษีของซัพพลายเออร์ และเลือกคลังสินค้าปลายทางที่จะนำของเข้าเก็บ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Scan or Search Incoming Items",
          my: "ရောက်ရှိလာသော ပစ္စည်းများကို စကင်ဖတ် သို့မဟုတ် ရှာဖွေခြင်း",
          th: "สแกนบาร์โค้ดหรือค้นหาสินค้าที่รับเข้า",
        },
        desc: {
          en: "Scan item barcodes to populate the receiving table with received quantity, unit of measure, and purchase unit cost.",
          my: "ပစ္စည်းဘားကုဒ်များကို စကင်ဖတ်၍ လက်ခံရရှိသော အရေအတွက်၊ ယူနစ်နှင့် ဝယ်ရင်းစျေးများကို ဖြည့်သွင်းပါ။",
          th: "ยิงบาร์โค้ดเพื่อระบุจำนวนที่ตรวจรับจริง หน่วยนับ และราคาต้นทุนต่อหน่วย.",
        },
      },
      {
        number: 3,
        label: {
          en: "Batch / Expiry / Serial Assignment",
          my: "အသုတ်အမှတ်၊ သက်တမ်းကုန်ဆုံးရက်နှင့် စီရီရယ်နံပါတ်",
          th: "ระบุเลขล็อต วันหมดอายุ และซีเรียลนัมเบอร์",
        },
        desc: {
          en: "Assign tracking batch identifiers and expiration dates for perishable items or warranty-tracked electronics.",
          my: "သက်တမ်းကုန်ရက်ပါသော ကုန်စည်များနှင့် အာမခံပါ ပစ္စည်းများအတွက် အသုတ်နံပါတ်နှင့် သက်တမ်းကုန်ရက်ကို မှတ်သားပါ။",
          th: "ใส่วันหมดอายุสำหรับสินค้าบริโภค หรือบันทึกหมายเลขซีเรียลสำหรับสินค้าอิเล็กทรอนิกส์.",
        },
      },
      {
        number: 4,
        label: {
          en: "Post Stock In & Update FIFO Layer",
          my: "ပစ္စည်းအဝင် အတည်ပြု၍ FIFO စာရင်းတွင် ထည့်သွင်းခြင်း",
          th: "ยืนยันรับเข้าคลังและอัปเดตต้นทุน FIFO",
        },
        desc: {
          en: "Click 'Submit Stock In'. The system immediately increments on-hand stock and creates a FIFO cost valuation allocation layer.",
          my: "'Submit Stock In' နှိပ်လိုက်ပါက စတော့လက်ကျန် ချက်ချင်းတိုးလာပြီး FIFO စာရင်းတွင် အလိုအလျောက် တွက်ချက်ထည့်သွင်းသွားမည်။",
          th: "กด 'Submit Stock In' ยอดสต็อกจะเพิ่มทันที พร้อมสร้างประวัติต้นทุนแบบ FIFO เพื่อความโปร่งใสทางบัญชี.",
        },
      },
    ],
    proTip: {
      en: "Accurate unit costs entered during Stock-In guarantee that Gross Profit reports under Insights > Reports reflect true business margins.",
      my: "ပစ္စည်းအဝင်တွင် ဝယ်ရင်းစျေးကို တိကျစွာ ထည့်သွင်းခြင်းဖြင့် Reports စာမျက်နှာတွင် အမြတ်ငွေ အစစ်အမှန်ကို တွေ့မြင်နိုင်ပါသည်။",
      th: "การใส่ต้นทุนที่ถูกต้องตอนรับของเข้า จะทำให้รายงานกำไรสุทธิในหน้า Reports คำนวณได้อย่างแม่นยำ 100%.",
    },
  },

  // 15. Storage Warehouses
  {
    id: "storage-warehouses",
    route: "/storage-locations",
    icon: "home",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/storage-warehouses.png",
    title: {
      en: "Multi-Warehouse Storage Locations & Bins",
      my: "ဂိုဒေါင်ပေါင်းစုံနှင့် သိုလှောင်ခန်း နေရာများ",
      th: "คลังสินค้าหลายสาขาและตำแหน่งจัดเก็บ (Bins)",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Manage physical store facilities: Main Storefront, Backroom Warehouse, Repair Workshop, and Damaged Quarantine Room with internal movement audits.",
      my: "ဆိုင်ရှေ့ကောင်တာ၊ ပစ္စည်းသိုလှောင်ရုံ၊ ပြင်ဆင်ရေး အလုပ်ရုံနှင့် ပျက်စီးပစ္စည်း သီးသန့်အခန်း စသည့် နေရာများကို စနစ်တကျ စီမံခန့်ခွဲပါ။",
      th: "จัดการสถานที่จัดเก็บสินค้า: หน้าร้าน คลังหลังร้าน แผนกช่างซ่อม และห้องพักสินค้าชำรุด พร้อมตรวจสอบการย้ายสต็อกภายใน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Storage Location Directory",
          my: "သိုလှောင်ခန်း နေရာများ စာရင်း",
          th: "รายชื่อคลังและตำแหน่งจัดเก็บ",
        },
        desc: {
          en: "View registered branches, storage zones, aisle shelves, and bin racks with their respective inventory capacities.",
          my: "ဆိုင်ခွဲများ၊ ဂိုဒေါင်ဇုန်များ၊ စင်နံပါတ်များနှင့် ကုန်ပစ္စည်း ဆံ့နိုင်သည့် ပမာဏများကို ကြည့်ရှုပါ။",
          th: "ดูรายชื่อคลังสินค้า โซนจัดเก็บ ล็อกชั้นวาง และความจุของแต่ละพื้นที่.",
        },
      },
      {
        number: 2,
        label: {
          en: "Add New Warehouse / Shelf (+ Add)",
          my: "ဂိုဒေါင် သို့မဟုတ် စင်အသစ် ထည့်သွင်းခြင်း (+ Add)",
          th: "เพิ่มคลังสินค้าหรือล็อกจัดเก็บใหม่ (+ Add)",
        },
        desc: {
          en: "Click '+ Add' to register a new storage facility, assign location type (Retail, Warehouse, Workshop), and designate manager.",
          my: "သိုလှောင်ရုံအသစ် ဖွင့်လှစ်ရန်၊ အမျိုးအစားသတ်မှတ်ရန်နှင့် တာဝန်ခံ မန်နေဂျာ ရွေးချယ်ရန် '+ Add' ကို နှိပ်ပါ။",
          th: "กดปุ่ม '+ Add' เพื่อสร้างคลังสินค้าใหม่ กำหนดประเภท (หน้าร้าน, คลังสินค้า, แผนกซ่อม) และผู้ดูแล.",
        },
      },
      {
        number: 3,
        label: {
          en: "Internal Location Transfers",
          my: "နေရာတစ်ခုမှ အခြားနေရာသို့ ပစ္စည်းလွှဲပြောင်းခြင်း",
          th: "โอนย้ายสินค้าระหว่างคลังภายใน",
        },
        desc: {
          en: "Move inventory seamlessly between Backroom storage and Front Sales racks to maintain optimal shelf stock.",
          my: "ဆိုင်ရှေ့စင်တွင် ပစ္စည်းပြည့်နေစေရန် သိုလှောင်ရုံမှ ဆိုင်ရှေ့သို့ လျင်မြန်စွာ လွှဲပြောင်းစာရင်းသွင်းပါ။",
          th: "โอนย้ายสต็อกจากคลังหลังร้านมายังชั้นวางหน้าร้าน เพื่อให้มีของพร้อมขายตลอดเวลา.",
        },
      },
    ],
    proTip: {
      en: "Designate a dedicated 'Quarantine' location for defective customer returns before claiming vendor supplier credits.",
      my: "ပျက်စီးနေသော ပစ္စည်းများကို စာရင်းမရောထွေးစေရန် သီးသန့် 'Quarantine' နေရာတွင် ခွဲခြားထားရှိပါ။",
      th: "ควรสร้างคลัง 'พักสินค้าชำรุด' แยกไว้ต่างหาก สำหรับเก็บสินค้าที่มีปัญหาเพื่อรอส่งเคลมซัพพลายเออร์.",
    },
  },

  // 16. Stock Movements
  {
    id: "stock-movements",
    route: "/stock/movements",
    icon: "history",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/stock-movements.png",
    title: {
      en: "Stock Movements & FIFO Audit Ledger",
      my: "ကုန်ပစ္စည်း လှုပ်ရှားမှုနှင့် FIFO စာရင်းစစ် မှတ်တမ်းချုပ်",
      th: "ประวัติการเคลื่อนไหวสต็อกและบัญชีตรวจสอบ FIFO",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Complete immutable audit trail of every inventory change: Stock In, POS Sales Decrements, Workshop Parts Usage, Damage Adjustments, and Stock Transfers.",
      my: "ပစ္စည်းအဝင်၊ အရောင်းကြောင့် လျော့နည်းမှု၊ အပိုပစ္စည်းထုတ်ယူမှု၊ ပျက်စီးဆုံးရှုံးမှုနှင့် လွှဲပြောင်းမှု မှတ်တမ်းအားလုံးကို မပြောင်းလဲနိုင်သော စာရင်းအဖြစ် ကြည့်ရှုပါ။",
      th: "บันทึกประวัติสต็อกที่ตรวจสอบได้ 100%: รับของเข้า ขายหน้าร้าน เบิกอะไหล่ซ่อม ปรับยอดของเสีย และการโอนย้ายระหว่างสาขา.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Event Type & Reason Filtering",
          my: "လှုပ်ရှားမှု အမျိုးအစားအလိုက် စစ်ထုတ်ခြင်း",
          th: "กรองตามประเภทเหตุการณ์และสาเหตุ",
        },
        desc: {
          en: "Filter ledger entries by event type: IN (Receiving), OUT (Sales), ADJUST (Count Audit), or REPAIR (Workshop usage).",
          my: "ပစ္စည်းအဝင် (IN)၊ အရောင်း (OUT)၊ စာရင်းစစ်ပြင်ဆင်ချက် (ADJUST) သို့မဟုတ် ပြင်ဆင်မှုသုံး (REPAIR) အလိုက် စစ်ထုတ်ပါ။",
          th: "กรองรายการตามประเภท: รับเข้า (IN), ขายออก (OUT), ปรับยอด (ADJUST) หรือเบิกใช้ในงานซ่อม (REPAIR).",
        },
      },
      {
        number: 2,
        label: {
          en: "Quantity Changes & Running Balance",
          my: "ပြောင်းလဲသွားသော အရေအတွက်နှင့် လက်ကျန်စာရင်း",
          th: "จำนวนที่เปลี่ยนแปลงและยอดคงเหลือสะสม",
        },
        desc: {
          en: "Review exact delta (+5, -2) alongside previous balance and resulting balance on hand at the exact second of operation.",
          my: "လုပ်ဆောင်ခဲ့သည့် အချိန်စက္ကန့်အလိုက် မူလလက်ကျန်၊ အတိုးအလျော့ ပမာဏနှင့် နောက်ဆုံးလက်ကျန်ကို တိုက်ဆိုင်စစ်ဆေးပါ။",
          th: "ตรวจสอบยอดที่เพิ่ม/ลด (+5, -2) เทียบกับยอดคงเหลือก่อนหน้าและยอดสุทธิหลังทำรายการแบบวินาทีต่อวินาที.",
        },
      },
      {
        number: 3,
        label: {
          en: "Inspect Movement Cost Detail",
          my: "ကုန်ကျစရိတ် အသေးစိတ်ကို နှိပ်၍ စစ်ဆေးခြင်း",
          th: "คลิกเพื่อดูรายละเอียดต้นทุนเชิงลึก",
        },
        desc: {
          en: "Click any movement row to inspect underlying FIFO lot cost allocations and linked receipt/invoice references.",
          my: "သက်ဆိုင်ရာ ပြေစာအမှတ်နှင့် FIFO ဝယ်ရင်းစျေး တွက်ချက်မှု အသေးစိတ်ကို ကြည့်ရှုရန် စာရင်းကြောင်းကို နှိပ်ပါ။",
          th: "คลิกที่แถวรายการเพื่อเปิดดูการตัดต้นทุนแบบ FIFO และเอกสารใบเสร็จ/ใบแจ้งหนี้ที่เชื่อมโยง.",
        },
      },
    ],
    proTip: {
      en: "Every cashier sale immediately creates a verified stock movement record, preventing phantom stock discrepancies.",
      my: "အရောင်းကောင်တာမှ ရောင်းချမှုတိုင်းသည် စတော့စာရင်းတွင် ချက်ချင်း မှတ်တမ်းဝင်သဖြင့် စာရင်းပျောက်ဆုံးမှု လုံးဝမရှိနိုင်ပါ။",
      th: "ทุกการขายที่แคชเชียร์จะตัดสต็อกและลงบันทึกในหน้านี้ทันที ป้องกันปัญหาสินค้าล่องหนหรือไม่ตรงกับยอดจริง.",
    },
  },

  // 17. Stock Movement Detail
  {
    id: "stock-movement-detail",
    route: "/stock/movements",
    icon: "eye",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/stock-movement-detail.png",
    title: {
      en: "Stock Movement Inspection & Cost Allocation Detail",
      my: "ကုန်ပစ္စည်း လှုပ်ရှားမှုနှင့် ကုန်ကျစရိတ် ခွဲဝေမှု အသေးစိတ် စစ်ဆေးခြင်း",
      th: "รายละเอียดการเคลื่อนไหวสต็อกและการจัดสรรต้นทุนสินค้า",
    },
    badge: {
      en: "Detail Inspection View",
      my: "အသေးစိတ် စစ်ဆေးမှု",
      th: "หน้ารายละเอียดเชิงลึก",
    },
    description: {
      en: "In-depth forensic audit screen for a specific stock movement: displays exact timestamp, performing cashier/admin, warehouse location, and FIFO lot layer allocations.",
      my: "စတော့လှုပ်ရှားမှုတစ်ခုချင်းစီ၏ အချိန်၊ ဆောင်ရွက်ခဲ့သူ ဝန်ထမ်း၊ သိုလှောင်ရုံနှင့် FIFO ဝယ်ရင်းစျေး ခွဲဝေမှုများကို အသေးစိတ် စစ်ဆေးနိုင်သော မျက်နှာပြင်။",
      th: "หน้าตรวจสอบเชิงลึกของรายการสต็อกแต่ละรายการ: แสดงเวลาที่ทำรายการ พนักงานผู้ปฏิบัติงาน คลังสินค้า และชั้นต้นทุน FIFO ที่ถูกตัดจ่าย.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Movement Summary & Audit Header",
          my: "လှုပ်ရှားမှု အကျဉ်းချုပ်နှင့် စာရင်းစစ် အချက်အလက်",
          th: "สรุปรายการและข้อมูลผู้ทำรายการ",
        },
        desc: {
          en: "Inspect primary movement details: Movement ID, Event Key, performed by user, and source/destination location.",
          my: "လှုပ်ရှားမှုအမှတ်၊ အမျိုးအစား၊ ဆောင်ရွက်သူ အမည်နှင့် ပစ္စည်းထွက်/ဝင်သည့် နေရာများကို စစ်ဆေးပါ။",
          th: "ตรวจสอบรหัสการเคลื่อนไหว ประเภทเหตุการณ์ ชื่อพนักงานผู้ทำรายการ และคลังต้นทาง/ปลายทาง.",
        },
      },
      {
        number: 2,
        label: {
          en: "FIFO Cost Allocations Breakdown",
          my: "FIFO ကုန်ကျစရိတ် ခွဲဝေမှု အသေးစိတ်",
          th: "แจกแจงการตัดต้นทุนแบบ FIFO",
        },
        desc: {
          en: "Review the exact purchase batches depleted, unit acquisition costs, and total cost of goods sold (COGS).",
          my: "မည်သည့် အသုတ်များမှ ကုန်ပစ္စည်းကို နှုတ်ယူခဲ့သည်၊ ဝယ်ရင်းစျေးနှုန်းနှင့် စုစုပေါင်း ကုန်ကျစရိတ်ကို တိုက်ဆိုင်စစ်ဆေးပါ။",
          th: "ดูข้อมูลล็อตสินค้าที่ถูกตัดไปใช้ ต้นทุนจริงที่รับเข้ามา และต้นทุนขายรวม (COGS) ของคำสั่งซื้อนี้.",
        },
      },
      {
        number: 3,
        label: {
          en: "Linked Order & Audit Reconciliation",
          my: "ချိတ်ဆက်ထားသော အရောင်းအော်ဒါနှင့် စာရင်းညှိနှိုင်းမှု",
          th: "เอกสารที่เกี่ยวข้องและการกระทบยอด",
        },
        desc: {
          en: "Jump directly to the linked Sales Transaction, Purchase GRN, or Repair Job ticket with a single click.",
          my: "သက်ဆိုင်ရာ အရောင်းပြေစာ၊ ဝယ်ယူမှုလွှာ သို့မဟုတ် ပြင်ဆင်မှုလက်မှတ်သို့ ခလုတ်တစ်ချက်နှိပ်ရုံဖြင့် တိုက်ရိုက် သွားရောက်ကြည့်ရှုပါ။",
          th: "คลิกลิงก์เพื่อเปิดดูใบเสร็จการขาย ใบรับของ หรือใบงานซ่อมที่เชื่อมโยงกับรายการนี้ได้ทันที.",
        },
      },
    ],
    proTip: {
      en: "If cost allocations display zero, verify whether the product was created with an initial unit cost in Product Management.",
      my: "ကုန်ကျစရိတ် သုညပြနေပါက ကုန်ပစ္စည်းစတင်ထည့်သွင်းစဉ်က ဝယ်ရင်းစျေး ဖြည့်သွင်းထားခြင်း ရှိမရှိ စစ်ဆေးပါ။",
      th: "หากยอดต้นทุนแสดงเป็น 0 ให้ตรวจสอบว่าตอนสร้างสินค้าได้ใส่ราคาต้นทุนมาตรฐานไว้หรือไม่.",
    },
  },

  // 18. Stock Assets
  {
    id: "stock-assets",
    route: "/assets",
    icon: "package",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/stock-assets.png",
    title: {
      en: "Fixed Business Assets & Depreciation Tracking",
      my: "ဆိုင်သုံး အသေပစ္စည်းများနှင့် တန်ဖိုးလျော့တွက်ချက်မှု မှတ်တမ်း",
      th: "ทรัพย์สินถาวรของร้านและการคิดค่าเสื่อมราคา",
    },
    badge: {
      en: "Asset Ledger",
      my: "ပစ္စည်းစာရင်း",
      th: "ทะเบียนทรัพย์สิน",
    },
    description: {
      en: "Track non-merchandise capital store assets: Barcode Scanners, Thermal Receipt Printers, POS Terminals, Air Conditioners, and Delivery Motorbikes.",
      my: "ရောင်းရန်မဟုတ်သော ဆိုင်သုံးပစ္စည်းများ - ဘားကုဒ်စကင်နာ၊ ပြေစာပရင်တာ၊ ကွန်ပျူတာ၊ လေအေးပေးစက်နှင့် ပို့ဆောင်ရေး ယာဉ်များကို စီမံခန့်ခွဲပါ။",
      th: "บันทึกทรัพย์สินถาวรของกิจการที่ไม่ใช่สินค้าขาย: สแกนเนอร์ เครื่องพิมพ์ใบเสร็จ จอ POS เครื่องปรับอากาศ และรถส่งของ.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Register New Fixed Asset (+ Add)",
          my: "ဆိုင်သုံးပစ္စည်း အသစ်မှတ်ပုံတင်ခြင်း (+ Add)",
          th: "ลงทะเบียนทรัพย์สินใหม่ (+ Add)",
        },
        desc: {
          en: "Click '+ Add' to input asset name, serial number, purchase acquisition date, and original cost.",
          my: "ပစ္စည်းအမည်၊ စီရီရယ်နံပါတ်၊ ဝယ်ယူခဲ့သည့်နေ့စွဲနှင့် မူလတန်ဖိုး ထည့်သွင်းရန် '+ Add' ကို နှိပ်ပါ။",
          th: "กด '+ Add' เพื่อระบุชื่อทรัพย์สิน ซีเรียลนัมเบอร์ วันที่ซื้อ และมูลค่าต้นทุนเริ่มแรก.",
        },
      },
      {
        number: 2,
        label: {
          en: "Location & Custodian Assignment",
          my: "ထားရှိသည့်နေရာနှင့် တာဝန်ခံဝန်ထမ်း သတ်မှတ်ခြင်း",
          th: "ระบุสถานที่ตั้งและพนักงานผู้รับผิดชอบ",
        },
        desc: {
          en: "Designate which store branch or workstation operates the equipment and designate a responsible staff custodian.",
          my: "မည်သည့်ဆိုင်ခွဲတွင် ထားရှိပြီး မည်သည့် ဝန်ထမ်းက တာဝန်ယူ အသုံးပြုနေသည်ကို သတ်မှတ်ပါ။",
          th: "ระบุสาขาและจุดติดตั้ง พร้อมมอบหมายชื่อพนักงานผู้ดูแลรับผิดชอบอุปกรณ์.",
        },
      },
      {
        number: 3,
        label: {
          en: "Depreciation Schedule & Net Book Value",
          my: "တန်ဖိုးလျော့ကျမှု တွက်ချက်ခြင်းနှင့် လက်ရှိတန်ဖိုး",
          th: "ตารางค่าเสื่อมราคาและมูลค่าตามบัญชีสุทธิ",
        },
        desc: {
          en: "Automatically calculate straight-line depreciation over the asset's useful lifetime for precise company balance sheets.",
          my: "နှစ်အလိုက် တန်ဖိုးလျော့ကျမှုကို အလိုအလျောက် တွက်ချက်ပေးသဖြင့် ဆိုင်၏ ဘဏ္ဍာရေးစာရင်း ပိုမိုမှန်ကန်စေပါသည်။",
          th: "ระบบคำนวณค่าเสื่อมราคาแบบเส้นตรงตามอายุการใช้งาน เพื่อให้งบดุลของร้านค้าถูกต้องแม่นยำ.",
        },
      },
    ],
    proTip: {
      en: "Print physical QR asset tags directly from this screen to paste onto computers and appliances for annual store audits.",
      my: "နှစ်စဉ် ပစ္စည်းစစ်ဆေးမှု လွယ်ကူစေရန် ဤမျက်နှာပြင်မှ QR တံဆိပ်များ ထုတ်ယူ၍ ပစ္စည်းများပေါ်တွင် ကပ်ထားနိုင်ပါသည်။",
      th: "พิมพ์ป้าย QR Code ทรัพย์สินจากหน้านี้ไปติดที่อุปกรณ์ เพื่อความสะดวกในการตรวจนับสต็อกประจำปี.",
    },
  },

  // 19. Transaction History
  {
    id: "transaction-history",
    route: "/sales",
    icon: "receipt",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/transaction-history.png",
    title: {
      en: "Sales Ledger & Receipt History - Cashier Audit",
      my: "အရောင်းမှတ်တမ်းချုပ်နှင့် ပြေစာမှတ်တမ်း - ငွေစာရင်းစစ်",
      th: "สมุดบันทึกการขายและประวัติใบเสร็จ - ตรวจสอบแคชเชียร์",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Chronological ledger of every customer order processed at POS registers. Search by receipt number, filter by payment status, reprint receipts, or trigger refunds.",
      my: "အရောင်းကောင်တာများမှ အရောင်းမှတ်တမ်းအားလုံးကို နေ့စွဲအလိုက် စစ်ဆေးပါ။ ဘောက်ချာနံပါတ်ဖြင့် ရှာဖွေခြင်း၊ ပြေစာပြန်ထုတ်ခြင်းနှင့် ငွေပြန်အမ်းခြင်းများ ပြုလုပ်ပါ။",
      th: "สมุดบันทึกรายการขายเรียงตามเวลา ค้นหาด้วยเลขที่ใบเสร็จ กรองสถานะการชำระเงิน พิมพ์ใบเสร็จซ้ำ หรือดำเนินการคืนเงิน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Filter by Date Range, Payment & Status",
          my: "နေ့စွဲ၊ ငွေချေမှုပုံစံနှင့် အခြေအနေအလိုက် စစ်ထုတ်ခြင်း",
          th: "กรองตามช่วงวันที่ ช่องทางชำระ และสถานะ",
        },
        desc: {
          en: "Filter transactions by date, cashier register, payment method (Cash, Card, QR), or status (Completed, Refunded, Pending).",
          my: "ရက်စွဲ၊ ကောင်တာ၊ ငွေချေနည်းလမ်း (ငွေသား၊ ကတ်၊ QR) သို့မဟုတ် အခြေအနေအလိုက် လျင်မြန်စွာ စစ်ထုတ်ရှာဖွေပါ။",
          th: "กรองรายการตามวันที่ จุดแคชเชียร์ ช่องทางการชำระ (เงินสด, บัตร, คิวอาร์) หรือสถานะ (สำเร็จ, คืนเงิน, รอดำเนินการ).",
        },
      },
      {
        number: 2,
        label: {
          en: "Inspect Sales Line Items & Tender Details",
          my: "ဝယ်ယူခဲ့သော ပစ္စည်းများနှင့် ငွေချေမှုစစ်ဆေးခြင်း",
          th: "ดูรายการสินค้าในบิลและการชำระเงิน",
        },
        desc: {
          en: "Click any sales transaction row to view sold products, quantity, unit prices, discounts, and exact change tendered.",
          my: "ရောင်းချခဲ့သော ပစ္စည်းများ၊ စျေးနှုန်း၊ လျှော့စျေးနှင့် အမ်းငွေများကို ကြည့်ရှုရန် စာရင်းကြောင်းကို နှိပ်ပါ။",
          th: "คลิกแถวรายการเพื่อดูรายการสินค้า จำนวน ราคาต่อหน่วย ส่วนลด และเงินทอนที่ให้ลูกค้า.",
        },
      },
      {
        number: 3,
        label: {
          en: "Reprint Thermal Receipt or Issue Refund",
          my: "ပြေစာ ပြန်လည်ထုတ်ပေးခြင်း သို့မဟုတ် ငွေပြန်အမ်းခြင်း",
          th: "พิมพ์ใบเสร็จซ้ำหรือทำรายการคืนเงิน",
        },
        desc: {
          en: "Reprint customer receipts via connected ESC/POS printer or execute a partial/full refund with automatic stock restoration.",
          my: "ချိတ်ဆက်ထားသော ပရင်တာမှ ပြေစာပြန်ထုတ်ပေးပါ သို့မဟုတ် ပစ္စည်းပြန်လည်သွင်းကာ ငွေပြန်အမ်းပေးပါ။",
          th: "สั่งพิมพ์ใบเสร็จซ้ำไปยังเครื่องพิมพ์ความร้อน หรือทำเรื่องคืนเงินพร้อมคืนสินค้ากลับเข้าสต็อกอัตโนมัติ.",
        },
      },
    ],
    proTip: {
      en: "Refunds processed here automatically reverse the corresponding FIFO stock movements and restore available inventory instantly.",
      my: "ဤနေရာတွင် ငွေပြန်အမ်းလိုက်ပါက ကုန်ပစ္စည်းလက်ကျန်စာရင်းထဲသို့ အလိုအလျောက် ပြန်လည်ရောက်ရှိသွားမည်ဖြစ်ပါသည်။",
      th: "เมื่อกดยืนยันการคืนเงิน ระบบจะดึงสต็อกสินค้าชิ้นนั้นกลับเข้าคลังให้ทันทีโดยไม่ต้องไปเพิ่มยอดเอง.",
    },
  },

  // 20. Transaction Detail
  {
    id: "transaction-detail",
    route: "/sales",
    icon: "eye",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/transaction-detail.png",
    title: {
      en: "Sales Transaction Receipt Inspection & Refund Modal",
      my: "အရောင်းပြေစာ အသေးစိတ် စစ်ဆေးမှုနှင့် ငွေပြန်အမ်း ပေါ့ပ်အပ်",
      th: "หน้ารายละเอียดใบเสร็จรับเงินและการขอคืนเงิน",
    },
    badge: {
      en: "Detail Inspection View",
      my: "ပြေစာ စစ်ဆေးမှု",
      th: "หน้ารายละเอียดใบเสร็จ",
    },
    description: {
      en: "Complete forensic view of an individual sale: cashier details, customer profile, itemized line items, tax breakdown, tendered payment splits, and refund processing.",
      my: "အရောင်းတစ်ခုချင်းစီ၏ ကောင်တာစာရေး၊ ဖောက်သည်အမည်၊ ဝယ်ယူခဲ့သော ပစ္စည်းများ၊ အခွန်တွက်ချက်မှု၊ ငွေချေနည်းလမ်းများနှင့် ငွေပြန်အမ်းမှု မျက်နှာပြင်။",
      th: "มุมมองตรวจสอบใบเสร็จอย่างละเอียด: ชื่อแคชเชียร์ ข้อมูลลูกค้า รายการสินค้า ภาษี สรุปยอดชำระแบบแยกช่องทาง และปุ่มทำเรื่องคืนเงิน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Customer & Terminal Meta Inspection",
          my: "ဖောက်သည်နှင့် ကောင်တာ အချက်အလက် စစ်ဆေးခြင်း",
          th: "ตรวจสอบข้อมูลลูกค้าและจุดแคชเชียร์",
        },
        desc: {
          en: "Review order time, terminal device ID, serving cashier staff name, and linked customer loyalty profile.",
          my: "အရောင်းပြုလုပ်ခဲ့သည့် အချိန်၊ စက်နံပါတ်၊ တာဝန်ကျ ဝန်ထမ်းနှင့် ဖောက်သည်အကောင့်ကို စစ်ဆေးပါ။",
          th: "ดูเวลาที่เกิดรายการ รหัสเครื่อง POS ชื่อแคชเชียร์ และข้อมูลบัญชีสมาชิกลูกค้า.",
        },
      },
      {
        number: 2,
        label: {
          en: "Itemized Bill & Applied Promotions",
          my: "ပစ္စည်းစာရင်းနှင့် အသုံးပြုခဲ့သော ပရိုမိုးရှင်းများ",
          th: "รายการสินค้าและโปรโมชันที่ได้รับ",
        },
        desc: {
          en: "Audit each purchased SKU, individual item discounts, applicable VAT/tax, and the final net payable.",
          my: "ဝယ်ယူခဲ့သော ပစ္စည်းတစ်ခုချင်းစီ၊ သီးသန့်ရရှိခဲ့သော လျှော့စျေး၊ ကုန်သွယ်လုပ်ငန်းခွန်နှင့် ကျသင့်ငွေကို စစ်ဆေးပါ။",
          th: "ตรวจเช็กสินค้าแต่ละชิ้น ส่วนลดเฉพาะรายการ ภาษีมูลค่าเพิ่ม และยอดสุทธิที่ชำระจริง.",
        },
      },
      {
        number: 3,
        label: {
          en: "Split Tender Reconciliation & Reprint",
          my: "ငွေချေမှုပုံစံ တိုက်ဆိုင်စစ်ဆေးခြင်းနှင့် ပြေစာပြန်ထုတ်ခြင်း",
          th: "ตรวจยอดเงินที่รับและสั่งพิมพ์ใบเสร็จ",
        },
        desc: {
          en: "Verify exact amounts paid via Cash, KBZPay, AYA Pay, or Credit Card, and click 'Print Receipt' for a fresh thermal slip.",
          my: "ငွေသား၊ KBZPay သို့မဟုတ် ကတ်ဖြင့် ချေခဲ့သော ငွေပမာဏများကို တိုက်ဆိုင်စစ်ဆေးပြီး ပြေစာအသစ် ထုတ်ပေးပါ။",
          th: "ตรวจสอบยอดเงินที่ชำระแยกตามช่องทาง (เงินสด, พร้อมเพย์, บัตร) และกด 'Print Receipt' เพื่อพิมพ์ใบเสร็จความร้อน.",
        },
      },
    ],
    proTip: {
      en: "Issuing a refund gives you the option to return funds to customer store credit balance rather than paying physical cash.",
      my: "ငွေပြန်အမ်းရာတွင် ငွေသားအစား ဖောက်သည်၏ ဆိုင်တွင်း အကြွေးလက်ကျန်ထဲသို့ ထည့်သွင်းပေးနိုင်ပါသည်။",
      th: "เมื่อทำเรื่องคืนเงิน สามารถเลือกโอนเป็นเครดิตสะสมในร้านให้ลูกค้าไว้ใช้ซื้อรอบหน้าแทนการจ่ายเงินสดได้.",
    },
  },

  // 21. Invoices
  {
    id: "invoices",
    route: "/invoices",
    icon: "receipt",
    category: "insights",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/invoices.png",
    title: {
      en: "Customer Invoices & Commercial Accounts Receivable",
      my: "ဖောက်သည် ငွေတောင်းခံလွှာများနှင့် ရရန်ရှိငွေ စာရင်းချုပ်",
      th: "ใบแจ้งหนี้ลูกค้าและบัญชีลูกหนี้การค้า",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Manage official business tax invoices, corporate credit terms (Net 15, Net 30), partial installment settlements, and overdue payment alerts.",
      my: "တရားဝင် အခွန်ငွေတောင်းခံလွှာများ၊ ကုမ္ပဏီသုံး အကြွေးစနစ် (ရက် ၁၅၊ ရက် ၃၀)၊ အရစ်ကျငွေပေးချေမှုများနှင့် ရက်လွန်ငွေ သတိပေးချက်များကို စီမံခန့်ခွဲပါ။",
      th: "จัดการใบแจ้งหนี้การค้าและใบกำกับภาษี กำหนดเครดิตเทอมธุรกิจ (15 วัน, 30 วัน) บันทึกการรับชำระเป็นงวด และแจ้งเตือนหนี้เกินกำหนด.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Invoice Aging & Outstanding Balances",
          my: "ရက်လွန်ငွေများနှင့် ရရန်ရှိငွေ လက်ကျန်များ",
          th: "วิเคราะห์อายุหนี้และยอดค้างชำระ",
        },
        desc: {
          en: "Track total unpaid balances classified by age buckets (Current, 1-30 Days Overdue, 30+ Days Overdue).",
          my: "မပေးချေသေးသော အကြွေးများကို သတ်မှတ်ရက်၊ ရက် ၃၀ လွန်နှင့် ရက်ရှည်လွန် စသည်ဖြင့် အဆင့်လိုက် ကြည့်ရှုပါ။",
          th: "ติดตามยอดหนี้ที่ยังไม่ชำระ แบ่งตามช่วงเวลา (ยังไม่ถึงกำหนด, เกิน 1-30 วัน, เกิน 30 วันขึ้นไป).",
        },
      },
      {
        number: 2,
        label: {
          en: "Generate New Tax Invoice (+ Add)",
          my: "ငွေတောင်းခံလွှာ အသစ်ထုတ်ပေးခြင်း (+ Add)",
          th: "ออกใบแจ้งหนี้ใหม่ (+ Add)",
        },
        desc: {
          en: "Create an official invoice for commercial clients with custom billing addresses, payment terms, and item lines.",
          my: "ကုမ္ပဏီဖောက်သည်များအတွက် လိပ်စာ၊ ငွေချေရမည့်ရက်နှင့် ပစ္စည်းစာရင်းများ ထည့်သွင်းကာ ဘောက်ချာအသစ် ဖန်တီးပါ။",
          th: "สร้างใบแจ้งหนี้อย่างเป็นทางการ ระบุที่อยู่ออกใบกำกับ เครดิตเทอม และรายการสินค้า.",
        },
      },
      {
        number: 3,
        label: {
          en: "Record Payment & Issue Receipt",
          my: "ငွေလက်ခံ ရရှိမှု မှတ်တမ်းတင်ခြင်း",
          th: "บันทึกการรับชำระเงินและออกใบเสร็จ",
        },
        desc: {
          en: "Record full or partial bank transfer settlements against the invoice to automatically update customer credit limits.",
          my: "ဘဏ်မှ ငွေလွှဲလက်ခံရရှိမှုကို ဘောက်ချာတွင် မှတ်သားလိုက်ပါက ဖောက်သည်၏ အကြွေးကန့်သတ်ချက် ပြန်လည်ပွင့်သွားမည်။",
          th: "บันทึกการรับเงินโอนธนาคารทั้งแบบเต็มจำนวนหรือแบ่งจ่าย เพื่อปรับเพิ่มวงเงินเครดิตให้ลูกค้าโดยอัตโนมัติ.",
        },
      },
    ],
    proTip: {
      en: "Export full invoice statements in PDF or Excel format to email directly to corporate finance accounting departments.",
      my: "ကုမ္ပဏီ စာရင်းကိုင်ဌာနများသို့ အီးမေးလ် ပေးပို့နိုင်ရန် ငွေတောင်းခံလွှာများကို PDF သို့မဟုတ် Excel ဖြင့် ထုတ်ယူနိုင်ပါသည်။",
      th: "สามารถส่งออกใบแจ้งหนี้เป็นไฟล์ PDF หรือ Excel เพื่อส่งอีเมลให้ฝ่ายบัญชีของลูกค้าบริษัทได้ทันที.",
    },
  },

  // 22. Customers
  {
    id: "customers",
    route: "/customers",
    icon: "users",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/customers.png",
    title: {
      en: "Customer Directory - Profiles, Loyalty & Credit Limits",
      my: "ဖောက်သည်များ လမ်းညွှန် - ပရိုဖိုင်၊ ရမှတ်များနှင့် အကြွေးကန့်သတ်ချက်",
      th: "ทำเนียบลูกค้า - โปรไฟล์ คะแนนสะสม และวงเงินสินเชื่อ",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Customer Relationship Management (CRM) directory: search shoppers by phone number, inspect lifetime purchase volumes, manage store credit limits, and assign pricing tiers.",
      my: "ဖုန်းနံပါတ်ဖြင့် ဖောက်သည်များကို ရှာဖွေပါ၊ တစ်သက်တာ ဝယ်ယူမှုပမာဏကို စစ်ဆေးပါ၊ အကြွေးပေးနိုင်သည့် ကန့်သတ်ချက်နှင့် စျေးနှုန်းအဆင့်များကို သတ်မှတ်ပါ။",
      th: "ระบบบริหารความสัมพันธ์ลูกค้า (CRM): ค้นหาด้วยเบอร์โทร ตรวจสอบยอดซื้อสะสม จัดการวงเงินสินเชื่อ และกำหนดระดับราคาสมาชิก.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Instant Phone & Name Search",
          my: "ဖုန်းနံပါတ်နှင့် အမည်ဖြင့် အမြန်ရှာဖွေခြင်း",
          th: "ค้นหาด่วนด้วยเบอร์โทรหรือชื่อ",
        },
        desc: {
          en: "Find customers instantly during cashier checkout by entering any part of their phone number or company name.",
          my: "အရောင်းကောင်တာတွင် ဖုန်းနံပါတ် သို့မဟုတ် ကုမ္ပဏီအမည် ရိုက်ထည့်ရုံဖြင့် ဖောက်သည်ကို ချက်ချင်း ရှာဖွေတွေ့ရှိနိုင်သည်။",
          th: "ค้นหาข้อมูลลูกค้าหน้าร้านได้อย่างรวดเร็ว เพียงพิมพ์เบอร์โทรศัพท์บางส่วนหรือชื่อบริษัท.",
        },
      },
      {
        number: 2,
        label: {
          en: "Credit Balance & Outstanding Debt Inspection",
          my: "အကြွေးလက်ကျန်နှင့် ကျန်ရှိငွေများကို စစ်ဆေးခြင်း",
          th: "ตรวจสอบวงเงินคงเหลือและยอดหนี้ค้างชำระ",
        },
        desc: {
          en: "Verify available customer credit limit before authorizing on-credit POS purchases or device repair handovers.",
          my: "ပစ္စည်းအကြွေးမရောင်းမီ သို့မဟုတ် ပြင်ပြီးပစ္စည်း မပေးအပ်မီ ဖောက်သည်၏ အကြွေးပေးနိုင်သည့် ပမာဏကို စစ်ဆေးပါ။",
          th: "ตรวจสอบวงเงินสินเชื่อที่เหลืออยู่ของลูกค้า ก่อนอนุมัติการขายเงินเชื่อหรือส่งมอบเครื่องซ่อม.",
        },
      },
      {
        number: 3,
        label: {
          en: "Create / Edit Customer Profile (+ Add)",
          my: "ဖောက်သည်အသစ် ထည့်သွင်းခြင်း (+ Add)",
          th: "เพิ่มหรือแก้ไขโปรไฟล์ลูกค้า (+ Add)",
        },
        desc: {
          en: "Click '+ Add' to register a new customer with delivery address, tax ID, and dedicated wholesale tier.",
          my: "ပို့ဆောင်ရမည့်လိပ်စာ၊ အခွန်နံပါတ်နှင့် လက်ကားအဆင့် သတ်မှတ်ချက်များ ထည့်သွင်းရန် '+ Add' ကို နှိပ်ပါ။",
          th: "กด '+ Add' เพื่อสร้างสมาชิกลูกค้าใหม่ พร้อมที่อยู่จัดส่ง เลขประจำตัวผู้เสียภาษี และระดับราคาขายส่ง.",
        },
      },
    ],
    proTip: {
      en: "Regular shoppers linked at checkout will accrue loyalty points automatically, redeemable on subsequent store visits.",
      my: "ဖောက်သည်ကို ချိတ်ဆက်ရောင်းချပါက ဝယ်ယူမှုအမှတ်များ အလိုအလျောက် တိုးပွားလာပြီး နောက်တစ်ကြိမ်တွင် လျှော့စျေးအဖြစ် သုံးနိုင်ပါသည်။",
      th: "การเลือกลูกค้าทุกครั้งที่ขาย จะช่วยสะสมคะแนนรอยัลตี้ให้อัตโนมัติ เพื่อนำมาใช้เป็นส่วนลดในครั้งถัดไป.",
    },
  },

  // 23. Customer Edit Modal
  {
    id: "customer-edit",
    route: "/customers",
    icon: "edit",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/customer-edit.png",
    title: {
      en: "Customer Account, Credit Limit & Terms Modal",
      my: "ဖောက်သည် အကောင့်၊ အကြွေးကန့်သတ်ချက်နှင့် စည်းကမ်းများ ပြင်ဆင်မှု ပေါ့ပ်အပ်",
      th: "หน้าต่างแก้ไขข้อมูลลูกค้า วงเงินสินเชื่อ และเงื่อนไขการค้า",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "ဖောက်သည် ပြင်ဆင်မှု",
      th: "แก้ไขข้อมูลลูกค้า",
    },
    description: {
      en: "Detailed profile editing dialog: update customer phone, delivery address, corporate tax ID, credit balance limits, payment term days, and assigned pricing tier.",
      my: "ဖောက်သည်၏ ဖုန်းနံပါတ်၊ ပို့ဆောင်ရမည့် လိပ်စာ၊ ကုမ္ပဏီ အခွန်အမှတ်၊ အကြွေးပေးနိုင်သည့် အများဆုံးပမာဏနှင့် စျေးနှုန်းအဆင့်များကို ပြင်ဆင်သတ်မှတ်နိုင်သော ပေါ့ပ်အပ်။",
      th: "หน้าต่างแก้ไขข้อมูลลูกค้าอย่างละเอียด: เบอร์โทรศัพท์ ที่อยู่จัดส่ง เลขประจำตัวผู้เสียภาษี วงเงินสินเชื่อสูงสุด ระยะเวลาเครดิตเทอม และระดับราคาขายส่ง.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Contact Identity & Corporate Tax Number",
          my: "ဆက်သွယ်ရန် အချက်အလက်နှင့် အခွန်မှတ်ပုံတင်နံပါတ်",
          th: "ข้อมูลติดต่อและเลขประจำตัวผู้เสียภาษี",
        },
        desc: {
          en: "Update primary phone, secondary contact, email, and commercial tax ID for official billing.",
          my: "ဖုန်းနံပါတ်၊ အီးမေးလ်နှင့် တရားဝင် ငွေတောင်းခံလွှာတွင် ထည့်သွင်းမည့် အခွန်နံပါတ်ကို ပြင်ဆင်ပါ။",
          th: "แก้ไขเบอร์โทรศัพท์ อีเมล และเลขประจำตัวผู้เสียภาษีสำหรับพิมพ์ลงในใบกำกับภาษี.",
        },
      },
      {
        number: 2,
        label: {
          en: "Credit Limit & Grace Period Days",
          my: "အကြွေးပမာဏ ကန့်သတ်ချက်နှင့် ရက်ချိန်း သတ်မှတ်ခြင်း",
          th: "กำหนดวงเงินสินเชื่อและระยะเวลาเครดิต",
        },
        desc: {
          en: "Set maximum allowed credit ceiling (e.g. $1,000) and net payment terms (e.g. 30 Days) before locking POS credit sales.",
          my: "အများဆုံး ပေးနိုင်သော အကြွေးပမာဏ (ဥပမာ ဒေါ်လာ ၁၀၀၀) နှင့် ရက် ၃၀ အကြွေးသတ်မှတ်ချက်ကို ရိုက်ထည့်ပါ။",
          th: "กำหนดเพดานวงเงินสินเชื่อสูงสุด (เช่น 30,000 บาท) และจำนวนวันเครดิตเทอม (เช่น 30 วัน) ก่อนที่ระบบจะล็อกการขายเชื่อ.",
        },
      },
      {
        number: 3,
        label: {
          en: "Wholesale Tier & Save Changes",
          my: "လက်ကား စျေးနှုန်းအဆင့်နှင့် ပြင်ဆင်ချက် သိမ်းဆည်းခြင်း",
          th: "เลือกระดับราคาขายส่งและบันทึกข้อมูล",
        },
        desc: {
          en: "Assign the appropriate pricing tier (Wholesale, Contractor) and click 'Save Changes' to apply immediately.",
          my: "ဖောက်သည်နှင့် ကိုက်ညီသော စျေးနှုန်းအဆင့်ကို ရွေးချယ်ပြီး 'Save Changes' နှိပ်၍ သိမ်းဆည်းပါ။",
          th: "เลือกระดับราคาขายส่งที่เหมาะสม แล้วกดปุ่ม 'Save Changes' เพื่อให้มีผลทันที.",
        },
      },
    ],
    proTip: {
      en: "Setting Credit Limit to 0 disables on-credit purchases for this customer, requiring upfront payment on all future orders.",
      my: "အကြွေးကန့်သတ်ချက်ကို ၀ ထားလိုက်ပါက ဤဖောက်သည်အား အကြွေးရောင်းချခွင့်ကို စနစ်မှ အလိုအလျောက် ပိတ်ပင်ထားမည်။",
      th: "หากตั้งวงเงินสินเชื่อเป็น 0 ระบบจะไม่อนุญาตให้ลูกค้าคนนี้ซื้อเงินเชื่อ ต้องชำระเงินสดหน้าร้านเท่านั้น.",
    },
  },

  // 24. Deliveries
  {
    id: "deliveries",
    route: "/deliveries",
    icon: "arrow",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/deliveries.png",
    title: {
      en: "Courier Logistics & Delivery Tracking Dashboard",
      my: "ပို့ဆောင်ရေး လုပ်ငန်းများနှင့် ပစ္စည်းပို့ဆောင်မှု ခြေရာခံခြင်း",
      th: "ระบบขนส่งพัสดุและติดตามการจัดส่งสินค้า",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Dispatch and monitor customer shipments across third-party couriers (Kerry, Flash, Royal Express) or in-house store delivery riders.",
      my: "ချောပို့ကုမ္ပဏီများ သို့မဟုတ် ဆိုင်ကိုယ်ပိုင် ပို့ဆောင်ရေးယာဉ်များဖြင့် ဖောက်သည်ထံ ပစ္စည်းပို့ဆောင်မှု အခြေအနေကို အချိန်နှင့်တပြေးညီ စောင့်ကြည့်ပါ။",
      th: "จัดการและติดตามพัสดุจัดส่งสินค้า ทั้งผ่านบริษัทขนส่งเอกชน (Kerry, Flash) และพนักงานส่งของของทางร้านเอง.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Delivery Status Pipeline",
          my: "ပို့ဆောင်မှု အဆင့်လိုက် စစ်ဆေးခြင်း",
          th: "ไปป์ไลน์สถานะการจัดส่ง",
        },
        desc: {
          en: "Track order parcels across statuses: Ready for Pickup, Dispatched, In Transit, Delivered, or Failed.",
          my: "ထုတ်ပိုးပြီး၊ လမ်းခရီးရောက်ရှိဆဲ၊ ပို့ဆောင်ပြီးစီး နှင့် ပို့ဆောင်မရခဲ့သော အခြေအနေများကို စစ်ဆေးပါ။",
          th: "ติดตามพัสดุตามสถานะ: รอส่งมอบ, ส่งออกแล้ว, อยู่ระหว่างนำจ่าย, จัดส่งสำเร็จ หรือนำจ่ายไม่สำเร็จ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Courier Provider Setup (+ Add)",
          my: "ချောပို့ကုမ္ပဏီ အသစ်ချိတ်ဆက်ခြင်း (+ Add)",
          th: "เพิ่มผู้ให้บริการขนส่ง (+ Add)",
        },
        desc: {
          en: "Register local shipping couriers with tracking URL templates and default delivery fees.",
          my: "ချောပို့လုပ်ငန်း အသစ်များ၊ ပါဆယ်ခြေရာခံ ဝဘ်ဆိုက်လင့်ခ်များနှင့် ပို့ဆောင်ခ စျေးနှုန်းများကို သတ်မှတ်ပါ။",
          th: "ลงทะเบียนบริษัทขนส่งใหม่ พร้อมลิงก์ติดตามพัสดุและอัตราค่าจัดส่งมาตรฐาน.",
        },
      },
      {
        number: 3,
        label: {
          en: "Update Tracking & Mark Delivered",
          my: "ခြေရာခံနံပါတ် ထည့်သွင်း၍ ပို့ဆောင်ပြီးအဖြစ် သတ်မှတ်ခြင်း",
          th: "ใส่เลขพัสดุและอัปเดตสถานะสำเร็จ",
        },
        desc: {
          en: "Input waybill tracking numbers and mark packages delivered upon courier proof of signature.",
          my: "ပါဆယ်နံပါတ်ကို ထည့်သွင်းပြီး ပစ္စည်းရောက်ရှိကြောင်း လက်မှတ်ရရှိပါက ပို့ဆောင်ပြီးစီးကြောင်း အတည်ပြုပါ။",
          th: "กรอกหมายเลขพัสดุ และกดเปลี่ยนสถานะเป็น 'จัดส่งสำเร็จ' เมื่อลูกค้าเซ็นรับของเรียบร้อย.",
        },
      },
    ],
    proTip: {
      en: "Orders flagged for delivery in the POS checkout dialog automatically flow into this dashboard for shipping label generation.",
      my: "POS အရောင်းတွင် ပို့ဆောင်ရေး ရွေးချယ်ခဲ့သော အော်ဒါများသည် လိပ်စာကတ် ထုတ်ယူနိုင်ရန် ဤစာမျက်နှာသို့ အလိုအလျောက် ရောက်ရှိလာမည်။",
      th: "ออเดอร์ที่เลือกการจัดส่งจากหน้าจอคิดเงิน POS จะถูกส่งมายังหน้านี้ทันทีเพื่อให้ทีมงานพิมพ์ใบปะหน้ากล่องได้เลย.",
    },
  },

  // 25. Delivery Edit Modal
  {
    id: "delivery-edit",
    route: "/deliveries",
    icon: "edit",
    category: "operations",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/delivery-edit.png",
    title: {
      en: "Courier Provider Setup & Tracking Modal",
      my: "ချောပို့လုပ်ငန်း သတ်မှတ်ချက်နှင့် ခြေရာခံခြင်း ပေါ့ပ်အပ်",
      th: "หน้าต่างตั้งค่าผู้ให้บริการขนส่งและหมายเลขพัสดุ",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "ချောပို့ ပြင်ဆင်မှု",
      th: "ตั้งค่าขนส่ง",
    },
    description: {
      en: "Configure courier shipping parameters: provider name, service type (Express, Standard, Cargo), tracking portal URL, base delivery fees, and dispatcher contact.",
      my: "ချောပို့ကုမ္ပဏီ အမည်၊ ဝန်ဆောင်မှုအမျိုးအစား (အမြန်၊ ရိုးရိုး၊ ကုန်စည်)၊ ခြေရာခံလင့်ခ်၊ ပို့ခနှုန်းထားနှင့် ဆက်သွယ်ရန် ဖုန်းနံပါတ်များကို သတ်မှတ်နိုင်သော ပေါ့ပ်အပ်။",
      th: "หน้าต่างกำหนดข้อมูลผู้ให้บริการขนส่ง: ชื่อขนส่ง ประเภทบริการ (ด่วน, ธรรมดา, ขนส่งใหญ่) เว็บไซต์เช็กพัสดุ ค่าส่ง และเบอร์ติดต่อ.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Courier Identity & Service Class",
          my: "ချောပို့ အမည်နှင့် ဝန်ဆောင်မှု အဆင့်အတန်း",
          th: "ชื่อบริษัทขนส่งและประเภทการส่ง",
        },
        desc: {
          en: "Input courier brand (e.g. Kerry Express, Royal Express) and select shipping scope (Same-day, Next-day, Regional Cargo).",
          my: "ချောပို့ကုမ္ပဏီ အမည်နှင့် ပို့ဆောင်မည့် နည်းလမ်း (တစ်ရက်တည်း၊ နောက်နေ့ရောက်၊ နယ်ဝေးကုန်စည်) ကို ရွေးချယ်ပါ။",
          th: "กรอกชื่อบริษัทขนส่ง และเลือกประเภทการจัดส่ง (ส่งด่วนภายในวัน, วันถัดไป, ส่งต่างจังหวัด).",
        },
      },
      {
        number: 2,
        label: {
          en: "Tracking URL Template",
          my: "ပါဆယ် ခြေရာခံ လင့်ခ်ဖော်မြူလာ",
          th: "เทมเพลตลิงก์ติดตามสถานะพัสดุ",
        },
        desc: {
          en: "Set tracking lookup URL so cashiers and customers can check parcel transit status with one click.",
          my: "ဖောက်သည်များ ပါဆယ်အခြေအနေကို လွယ်ကူစွာ စစ်ဆေးနိုင်စေရန် ခြေရာခံ လင့်ခ်ပုံစံကို ထည့်သွင်းထားပါ။",
          th: "ใส่ลิงก์ตรวจสอบพัสดุ เพื่อให้แคชเชียร์และลูกค้ากดดูสถานะการนำจ่ายได้ทันทีด้วยคลิกเดียว.",
        },
      },
      {
        number: 3,
        label: {
          en: "Base Delivery Fee & Save Provider",
          my: "မူလ ပို့ဆောင်ခနှုန်းနှင့် သိမ်းဆည်းခြင်း",
          th: "กำหนดอัตราค่าส่งพื้นฐานและบันทึก",
        },
        desc: {
          en: "Define standard shipping rate applied during POS order checkout and save configuration.",
          my: "POS အရောင်းတွင် အလိုအလျောက် ပေါင်းထည့်ပေးမည့် ပို့ဆောင်ခနှုန်းထားကို သတ်မှတ်ပြီး သိမ်းဆည်းပါ။",
          th: "กำหนดค่าจัดส่งมาตรฐานที่จะถูกนำไปคำนวณในหน้า POS แล้วกดบันทึกข้อมูล.",
        },
      },
    ],
    proTip: {
      en: "Configure multiple providers with distinct regional coverage to give customers optimal shipping rates at checkout.",
      my: "နယ်မြေအလိုက် ချောပို့လုပ်ငန်း အမျိုးမျိုးကို ထည့်သွင်းထားခြင်းဖြင့် ဖောက်သည်များအတွက် အသက်သာဆုံး ပို့ခကို ရွေးချယ်ပေးနိုင်ပါသည်။",
      th: "ควรตั้งค่าขนส่งไว้หลายเจ้าแยกตามพื้นที่ เพื่อให้ลูกค้าเลือกค่าจัดส่งที่คุ้มค่าที่สุดตอนคิดเงิน.",
    },
  },

  // 26. Promotions
  {
    id: "promotions",
    route: "/promotions",
    icon: "tag",
    category: "insights",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/promotions.png",
    title: {
      en: "Promotional Discounts & Campaign Rules Engine",
      my: "ပရိုမိုးရှင်း လျှော့စျေးများနှင့် ကမ်ပိန်း စည်းမျဉ်းများ",
      th: "ระบบโปรโมชัน ส่วนลด และแคมเปญการตลาด",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Design automated discounting rules: Percentage Off, Fixed Cash Deductions, Buy-One-Get-One (BOGO), and minimum ticket spend triggers with start/end scheduling.",
      my: "ရာခိုင်နှုန်းလျှော့စျေး၊ ငွေသားလျှော့စျေး၊ တစ်ခုဝယ်တစ်ခုလက်ဆောင် (BOGO) နှင့် သတ်မှတ်ငွေပြည့်ပါက လျှော့ပေးမည့် စည်းမျဉ်းများကို သတ်မှတ်ပါ။",
      th: "ออกแบบโปรโมชันอัตโนมัติ: ลดเป็นเปอร์เซ็นต์ ลดเป็นจำนวนเงินสด ซื้อ 1 แถม 1 (BOGO) และลดเมื่อซื้อครบตามยอด พร้อมตั้งเวลาเปิด/ปิดแคมเปญ.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Campaign Scheduling & Date Windows",
          my: "ကမ်ပိန်း စတင်/ပြီးဆုံးမည့် ရက်စွဲများ သတ်မှတ်ခြင်း",
          th: "กำหนดระยะเวลาเริ่มต้นและสิ้นสุดแคมเปญ",
        },
        desc: {
          en: "Set promotional start dates, expiry deadlines, and active hours (e.g. Flash Sales, Weekend Specials).",
          my: "ပရိုမိုးရှင်း စတင်မည့်နေ့၊ ကုန်ဆုံးမည့်ရက်နှင့် အထူးလျှော့စျေး အချိန်အပိုင်းအခြားများကို သတ်မှတ်ပါ။",
          th: "ระบุวันเริ่มแคมเปญ วันหมดเขต และช่วงเวลาโปรโมชันพิเศษ (เช่น แฟลชเซลล์ หรือโปรโมชันวันหยุดสุดสัปดาห์).",
        },
      },
      {
        number: 2,
        label: {
          en: "Discount Mechanics & Criteria",
          my: "လျှော့စျေး နည်းလမ်းများနှင့် စည်းကမ်းချက်များ",
          th: "เงื่อนไขส่วนลดและสิทธิประโยชน์",
        },
        desc: {
          en: "Specify criteria: flat discount amount, percentage reduction, or tiered spend tiers (e.g., spend $100 get $10 off).",
          my: "ရာခိုင်နှုန်းဖြင့် လျှော့မည် သို့မဟုတ် သတ်မှတ်ငွေပြည့်ပါက ငွေသားပြန်လျှော့ပေးမည် စသည့် စည်းကမ်းများ သတ်မှတ်ပါ။",
          th: "เลือกประเภทส่วนลด: หักเงินสด หักเปอร์เซ็นต์ หรือขั้นบันได (เช่น ซื้อครบ 1,000 บาท ลดทันที 100 บาท).",
        },
      },
      {
        number: 3,
        label: {
          en: "Product Scope & Exclusion Rules",
          my: "အကျုံးဝင်မည့် ပစ္စည်းများနှင့် ချွင်းချက်များ",
          th: "เลือกสินค้าที่ร่วมรายการและข้อยกเว้น",
        },
        desc: {
          en: "Apply promotion to the entire store, specific product categories, or exclude clearance items.",
          my: "ဆိုင်တစ်ခုလုံး၊ သီးသန့် ကုန်ပစ္စည်းအုပ်စု သို့မဟုတ် လျှော့စျေးမပေးလိုသော ပစ္စည်းများကို ခွဲခြားသတ်မှတ်ပါ။",
          th: "เลือกว่าจะใช้กับสินค้าทั้งร้าน เฉพาะบางหมวดหมู่ หรือยกเว้นสินค้าที่ลดล้างสต็อกอยู่แล้ว.",
        },
      },
    ],
    proTip: {
      en: "Active promotions apply automatically at the POS cart when qualifying criteria are met without requiring cashier coupon codes.",
      my: "သတ်မှတ်ချက် ပြည့်မီပါက အရောင်းကောင်တာတွင် ကူပွန်ကုဒ် ရိုက်ထည့်ရန်မလိုဘဲ အလိုအလျောက် လျှော့စျေး ကျဆင်းသွားမည်။",
      th: "เมื่อลูกค้าซื้อครบตามเงื่อนไข ระบบ POS จะคำนวณส่วนลดให้อัตโนมัติในตะกร้า โดยที่แคชเชียร์ไม่ต้องจำรหัสคูปอง.",
    },
  },

  // 27. Repairs Workflow
  {
    id: "repairs-workflow",
    route: "/repairs",
    icon: "repair",
    category: "repairs",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/repairs-workflow.png",
    title: {
      en: "Device Repairs & Workshop Service Pipeline",
      my: "ပစ္စည်း ပြင်ဆင်မှုနှင့် အလုပ်ရုံ ဝန်ဆောင်မှု လုပ်ငန်းစဉ်",
      th: "ศูนย์บริการงานซ่อมอุปกรณ์และกระดานติดตามงานช่าง",
    },
    badge: {
      en: "Repairs Module",
      my: "ပြင်ဆင်ရေး ကဏ္ဍ",
      th: "แผนกงานซ่อม",
    },
    description: {
      en: "Visual Kanban board tracking device repair lifecycle: Intake Diagnosis, Quotation Awaiting Approval, In-Progress Repair, Quality Inspection, and Ready for Collection.",
      my: "ပစ္စည်းလက်ခံစစ်ဆေးခြင်း၊ စျေးနှုန်းအတည်ပြုချက်စောင့်ဆိုင်းခြင်း၊ ပြင်ဆင်ဆဲ၊ အရည်အသွေးစစ်ဆေးခြင်းနှင့် ပြန်လည်ထုတ်ယူနိုင်ပြီ စသည့် အဆင့်များကို စောင့်ကြည့်သည့် မျက်နှာပြင်။",
      th: "กระดานคันบังติดตามสถานะงานซ่อม: รับเครื่องตรวจเช็ก รออนุมัติราคา กำลังซ่อมแซม ตรวจสอบคุณภาพ (QC) และพร้อมส่งมอบลูกค้า.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Repair Kanban Pipeline Stages",
          my: "ပြင်ဆင်မှု အဆင့်အလိုက် ကတ်ပြားများ ကြည့်ရှုခြင်း",
          th: "ขั้นตอนในกระดานติดตามงานซ่อม",
        },
        desc: {
          en: "Drag-and-drop or update ticket stages as technicians diagnose, service, and test repaired electronic devices.",
          my: "ပစ္စည်းများကို စစ်ဆေးပြင်ဆင်ပြီးစီးမှုအလိုက် သက်ဆိုင်ရာ အဆင့်ကတ်ပြားများသို့ ရွှေ့ပြောင်းသတ်မှတ်ပါ။",
          th: "ลากและวางหรือเปลี่ยนสถานะใบงานซ่อม เมื่อช่างเริ่มลงมือซ่อม ทดสอบเครื่อง และซ่อมเสร็จสมบูรณ์.",
        },
      },
      {
        number: 2,
        label: {
          en: "New Repair Intake Ticket (+ Add)",
          my: "ပြင်ဆင်ရန် ပစ္စည်းအသစ် လက်ခံခြင်း (+ Add)",
          th: "เปิดใบรับซ่อมเครื่องใหม่ (+ Add)",
        },
        desc: {
          en: "Click '+ Add' to launch the detailed intake dialog with hardware diagnostics checklist and passcodes.",
          my: "ပစ္စည်းစစ်ဆေးချက်များနှင့် လော့ခ်ကုဒ်များ မှတ်သားနိုင်သော ပေါ့ပ်အပ်ကို ဖွင့်ရန် '+ Add' ကို နှိပ်ပါ။",
          th: "กดปุ่ม '+ Add' เพื่อเปิดแบบฟอร์มรับเครื่องซ่อม พร้อมบันทึกอาการเสีย รหัสปลดล็อก และประเมินราคาเบื้องต้น.",
        },
      },
      {
        number: 3,
        label: {
          en: "Labor Costs & Replacement Parts Depletion",
          my: "လက်ခ ကုန်ကျစရိတ်နှင့် လဲလှယ်အပိုပစ္စည်းများ ထုတ်ယူခြင်း",
          th: "บันทึกค่าแรงช่างและเบิกอะไหล่ตัดสต็อก",
        },
        desc: {
          en: "Assign technician labor fees and link replacement spare parts which are automatically deducted from store inventory.",
          my: "ကျသင့်မည့် လက်ခနှင့် လဲလှယ်တပ်ဆင်ရသော အပိုပစ္စည်းများကို ထည့်သွင်းပါ၊ စတော့စာရင်းမှ အလိုအလျောက် နှုတ်ယူသွားမည်။",
          th: "ระบุค่าบริการวิชาชีพ และเบิกอะไหล่แท้จากระบบ ซึ่งจะทำการตัดสต็อกสินค้าในคลังให้อัตโนมัติ.",
        },
      },
      {
        number: 4,
        label: {
          en: "Ready for Pickup & Customer Handover",
          my: "ပြင်ဆင်ပြီးစီး၍ ဖောက်သည်ထံ ပြန်လည်လွှဲပြောင်းပေးခြင်း",
          th: "แจ้งรับเครื่องและส่งมอบพร้อมรับชำระ",
        },
        desc: {
          en: "Transition to 'Ready for Pickup' to send SMS notifications and collect remaining repair balances at POS register.",
          my: "'Ready for Pickup' သို့ ပြောင်းလဲ၍ ဖောက်သည်ထံ အကြောင်းကြားပြီး ကျန်ငွေကို ကောင်တာတွင် ကောက်ခံပါ။",
          th: "เปลี่ยนสถานะเป็น 'พร้อมส่งมอบ' เพื่อแจ้งเตือนลูกค้า และคิดเงินค่าซ่อมส่วนที่เหลือผ่านหน้า POS.",
        },
      },
    ],
    proTip: {
      en: "Print a physical repair job ticket receipt with intake barcode and attach it directly to the customer's device bag.",
      my: "ဘားကုဒ်ပါရှိသော ပြင်ဆင်မှု လက်မှတ်စာရွက်ကို ပရင်တာမှ ထုတ်ယူပြီး ပစ္စည်းထည့်သည့် အိတ်တွင် တွဲကပ်ထားပါ။",
      th: "สั่งพิมพ์ใบรับเครื่องซ่อมที่มีบาร์โค้ดออกมาติดไว้ที่ถุงใส่เครื่อง เพื่อป้องกันการสลับเครื่องผิด.",
    },
  },

  // 28. Repair Intake Modal
  {
    id: "repair-intake-modal",
    route: "/repairs",
    icon: "plus",
    category: "repairs",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/repair-intake-modal.png",
    title: {
      en: "Device Intake & Diagnostic Checklist Modal",
      my: "ပြင်ဆင်မည့် ပစ္စည်းလက်ခံခြင်းနှင့် စစ်ဆေးချက် မှတ်တမ်း ပေါ့ပ်အပ်",
      th: "หน้าต่างรับเครื่องซ่อมและรายการตรวจเช็กอาการเสีย",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "ပစ္စည်းလက်ခံမှု မျက်နှာပြင်",
      th: "แบบฟอร์มรับซ่อม",
    },
    description: {
      en: "Check-in dialog for incoming customer devices: record brand, model, serial/IMEI, security unlock PIN, physical scratches/dents, reported faults, and deposit payments.",
      my: "ဖောက်သည်ထံမှ ပစ္စည်းလက်ခံရာတွင် ထည့်သွင်းရမည့် အချက်အလက်များ - တံဆိပ်၊ မော်ဒယ်၊ IMEI၊ လော့ခ် PIN၊ ပွန်းပဲ့မှု အခြေအနေ၊ ချို့ယွင်းချက်များနှင့် စရံငွေ။",
      th: "หน้าต่างตรวจรับอุปกรณ์ของลูกค้า: ระบุยี่ห้อ รุ่น ซีเรียล/IMEI รหัสปลดล็อก รอยขีดข่วนหรือตำหนิตัวเครื่อง อาการเสียที่แจ้ง และเงินมัดจำ.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Device Identification & Passcode",
          my: "ပစ္စည်း အချက်အလက်နှင့် ဖွင့်ခွင့် လျှို့ဝှက်ကုဒ်",
          th: "ข้อมูลรุ่นอุปกรณ์และรหัสผ่านหน้าจอ",
        },
        desc: {
          en: "Record device make, exact model number, serial or IMEI, and customer unlock PIN for technician hardware testing.",
          my: "တံဆိပ်၊ မော်ဒယ်အမှတ်၊ စီရီရယ် သို့မဟုတ် IMEI နံပါတ်နှင့် စမ်းသပ်ရန် လိုအပ်သော လော့ခ် PIN ကို မှတ်သားပါ။",
          th: "บันทึกยี่ห้อ รุ่น รหัสเครื่อง IMEI และรหัสผ่านปลดล็อกหน้าจอเพื่อให้ช่างเปิดเครื่องทดสอบระบบ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Physical Condition & Fault Checklist",
          my: "ပြင်ပအခြေအနေနှင့် ချို့ယွင်းချက် စစ်ဆေးချက်များ",
          th: "ตรวจสภาพภายนอกและบันทึกอาการเสีย",
        },
        desc: {
          en: "Select preset condition tags (Scratched Screen, Water Damage) and check off reported customer issue symptoms.",
          my: "စခရင် ကွဲအက်မှု၊ ရေဝင်မှု စသည့် လက်ရှိ အခြေအနေများနှင့် ဖောက်သည်ပြောပြသော ချို့ယွင်းချက်များကို ရွေးချယ်ပါ။",
          th: "เลือกสภาพตัวเครื่องเดิม (จอมีรอย, ตกน้ำ) และติ๊กเลือกอาการเสียตามที่ลูกค้าแจ้งเพื่อเป็นหลักฐาน.",
        },
      },
      {
        number: 3,
        label: {
          en: "Estimated Quote & Advance Deposit",
          my: "ခန့်မှန်း ကုန်ကျစရိတ်နှင့် ကြိုတင် စရံငွေ",
          th: "ประเมินราคาซ่อมและรับเงินมัดจำ",
        },
        desc: {
          en: "Enter initial repair quotation estimate and collect an advance deposit paid via cash or digital QR transfer.",
          my: "ခန့်မှန်း ကျသင့်ငွေကို သတ်မှတ်ပြီး ကြိုတင် စရံငွေကို ငွေသား သို့မဟုတ် QR ဖြင့် လက်ခံမှတ်သားပါ။",
          th: "ระบุราคาซ่อมประเมินเบื้องต้น และบันทึกเงินมัดจำล่วงหน้าที่รับมาแล้วผ่านเงินสดหรือสแกนจ่าย.",
        },
      },
      {
        number: 4,
        label: {
          en: "Generate Job Ticket & Print Claim Slip",
          my: "လက်မှတ်ဖွင့်၍ ပစ္စည်းလက်ခံပြေစာ ထုတ်ပေးခြင်း",
          th: "สร้างใบงานและพิมพ์สลิปรับเครื่องให้ลูกค้า",
        },
        desc: {
          en: "Confirm intake to print a physical claim receipt for the customer containing the claim barcode number.",
          my: "အတည်ပြုသိမ်းဆည်းလိုက်သည်နှင့် ဖောက်သည်အတွက် ဘားကုဒ်ပါရှိသော ပစ္စည်းလက်ခံပြေစာကို ထုတ်ပေးနိုင်ပါမည်။",
          th: "กดยืนยันเพื่อบันทึกงานซ่อม พร้อมพิมพ์ใบรับเครื่องที่มีหมายเลขบาร์โค้ดส่งมอบให้ลูกค้าถือกลับ.",
        },
      },
    ],
    proTip: {
      en: "Documenting pre-existing physical cracks during intake protects the shop from liability when handing back repaired electronics.",
      my: "ပစ္စည်းလက်ခံစဉ်ကတည်းက ရှိနေသော ပွန်းပဲ့မှုများကို မှတ်သားထားခြင်းဖြင့် ဖောက်သည်နှင့် အငြင်းပွားမှုကို ကာကွယ်ပေးပါသည်။",
      th: "การบันทึกรอยตำหนิเดิมตั้งแต่ตอนรับเครื่อง จะช่วยป้องกันปัญหาการเข้าใจผิดหรือเรียกร้องค่าเสียหายตอนส่งมอบ.",
    },
  },

  // 29. Repair Order Edit Modal
  {
    id: "repair-order-edit",
    route: "/repairs",
    icon: "edit",
    category: "repairs",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/repair-order-edit.png",
    title: {
      en: "Repair Job Billing, Labor & Parts Modal",
      my: "ပြင်ဆင်မှု ကုန်ကျစရိတ်၊ လက်ခနှင့် အပိုပစ္စည်းများ ပြင်ဆင်ချက် ပေါ့ပ်အပ်",
      th: "หน้าต่างคิดเงินงานซ่อม ค่าแรง และการเบิกอะไหล่",
    },
    badge: {
      en: "CRUD Modal Form",
      my: "ပြင်ဆင်မှု ငွေတောင်းခံလွှာ",
      th: "คิดเงินงานซ่อม",
    },
    description: {
      en: "Comprehensive technician settlement screen: manage replaced spare parts, hourly labor charges, customer deposit deductions, payment history, and warranty issuance.",
      my: "လဲလှယ်ခဲ့သော အပိုပစ္စည်းများ၊ လက်ခ၊ ကြိုတင်ပေးထားသော စရံငွေ နှုတ်ယူမှု၊ ငွေပေးချေမှု မှတ်တမ်းနှင့် အာမခံပေးအပ်မှုများကို စီမံနိုင်သော မျက်နှာပြင်။",
      th: "หน้าต่างสรุปบิลงานซ่อม: เพิ่มรายการอะไหล่ที่เปลี่ยน คิดค่าแรงช่าง หักยอดเงินมัดจำ บันทึกประวัติการรับชำระ และเปิดใบรับประกันงานซ่อม.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Technician Labor Fee Assignment",
          my: "ကျွမ်းကျင်မှု လက်ခ သတ်မှတ်ထည့်သွင်းခြင်း",
          th: "กำหนดค่าแรงและค่าบริการช่าง",
        },
        desc: {
          en: "Input itemized labor charges based on job difficulty (e.g. Screen Replacement Labor: $25).",
          my: "ပြုပြင်ရသည့် အခက်အခဲအပေါ် မူတည်၍ လက်ခနှုန်းထားများကို ခွဲခြားထည့်သွင်းပါ။",
          th: "ระบุค่าแรงตามความยากง่ายของงานซ่อม (เช่น ค่าบริการเปลี่ยนหน้าจอ 500 บาท).",
        },
      },
      {
        number: 2,
        label: {
          en: "Spare Parts Allocation & Stock Depletion",
          my: "လဲလှယ်တပ်ဆင်သော အပိုပစ္စည်းများ ထည့်သွင်းခြင်း",
          th: "เลือกอะไหล่ที่ใช้และตัดสต็อกสินค้า",
        },
        desc: {
          en: "Select replacement components from store catalog. Stock quantities are decremented with FIFO cost tracking.",
          my: "ဆိုင်တွင်းရှိ အပိုပစ္စည်းများကို ရွေးချယ်တပ်ဆင်ပါ၊ စတော့လက်ကျန်စာရင်းမှ အလိုအလျောက် နှုတ်ယူသွားပါမည်။",
          th: "เลือกอะไหล่จากคลังสินค้าของร้าน ระบบจะทำการตัดสต็อกและบันทึกต้นทุน FIFO ให้อัตโนมัติ.",
        },
      },
      {
        number: 3,
        label: {
          en: "Deposit Deduction & Net Balance Collection",
          my: "စရံငွေ နှုတ်ယူ၍ ကျန်ငွေ ကောက်ခံခြင်း",
          th: "หักเงินมัดจำและรับชำระเงินส่วนที่เหลือ",
        },
        desc: {
          en: "System subtracts pre-paid advance deposits; process remaining balance via Cash, Card, or QR Pay.",
          my: "ကြိုပေးထားသော စရံငွေကို စနစ်က အလိုအလျောက် နှုတ်ပေးမည်ဖြစ်ပြီး ကျန်ရှိငွေကို ကောင်တာတွင် လက်ခံပါ။",
          th: "ระบบจะนำเงินมัดจำมาหักลบยอดรวมให้อัตโนมัติ พร้อมคิดเงินส่วนต่างที่เหลือผ่านเงินสด บัตร หรือสแกน QR.",
        },
      },
      {
        number: 4,
        label: {
          en: "Assign Service Warranty & Close Order",
          my: "ပြင်ဆင်မှု အာမခံရက် သတ်မှတ်ပြီး အော်ဒါပိတ်သိမ်းခြင်း",
          th: "กำหนดประกันงานซ่อมและปิดใบงาน",
        },
        desc: {
          en: "Set service warranty period (e.g. 90 Days warranty on replacement battery) and finalize ticket.",
          my: "ပြင်ဆင်မှု အာမခံကာလ (ဥပမာ ဘက်ထရီအတွက် ရက် ၉၀) သတ်မှတ်ပေးပြီး အော်ဒါကို အပြီးသတ် သိမ်းဆည်းပါ။",
          th: "ระบุระยะเวลารับประกันงานซ่อม (เช่น รับประกันแบตเตอรี่ 90 วัน) และกดยืนยันปิดงานส่งมอบเครื่อง.",
        },
      },
    ],
    proTip: {
      en: "Closing a repair job automatically records the revenue under Workshop Services in your store profit analytics.",
      my: "ပြင်ဆင်မှု ပြီးစီး၍ ငွေလက်ခံလိုက်ပါက ဆိုင်၏ အမြတ်ငွေ အစီရင်ခံစာတွင် ဝန်ဆောင်မှု ဝင်ငွေအဖြစ် အလိုအလျောက် ပေါင်းထည့်ပေးမည်။",
      th: "เมื่อปิดงานซ่อม รายได้จากค่าแรงและค่าอะไหล่จะถูกส่งเข้าหมวดรายได้บริการในหน้ารายงานการเงินทันที.",
    },
  },

  // 30. Repairs Catalog
  {
    id: "repairs-catalog",
    route: "/repairs/catalog",
    icon: "book",
    category: "repairs",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/repairs-catalog.png",
    title: {
      en: "Repair Services & Labor Standard Price Directory",
      my: "ပြင်ဆင်မှု ဝန်ဆောင်မှုများနှင့် စံသတ်မှတ် လက်ခနှုန်းထားများ",
      th: "แคตตาล็อกบริการงานซ่อมและอัตราค่าแรงมาตรฐาน",
    },
    badge: {
      en: "Repairs Module",
      my: "ပြင်ဆင်ရေး ကဏ္ဍ",
      th: "แผนกงานซ่อม",
    },
    description: {
      en: "Standardized catalog of recurring technician services: Screen Replacement, Battery Renewal, Water Damage Ultrasonic Cleaning, and OS Reinstallation with fixed labor rates.",
      my: "မကြာခဏ ဆောင်ရွက်ရသော ဝန်ဆောင်မှုများ - မျက်နှာပြင်လဲခြင်း၊ ဘက်ထရီလဲခြင်း၊ ရေဝင်ဆေးကြောခြင်းနှင့် ဆော့ဖ်ဝဲလ်တင်ခြင်း စသည့် သတ်မှတ်နှုန်းထားများ။",
      th: "ศูนย์รวมมาตรฐานราคาบริการงานซ่อม: เปลี่ยนหน้าจอ เปลี่ยนแบตเตอรี่ ล้างบอร์ดตกน้ำ และลงระบบปฏิบัติการ พร้อมกำหนดราคาค่าแรงมาตรฐาน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Service Code & Job Description",
          my: "ဝန်ဆောင်မှုကုဒ်နှင့် လုပ်ငန်းဖော်ပြချက်",
          th: "รหัสบริการและรายละเอียดงาน",
        },
        desc: {
          en: "Define clear service items (e.g. 'OLED Screen Renewal', 'Port Micro-soldering').",
          my: "ဝန်ဆောင်မှု အမည်များကို ရှင်းလင်းစွာ သတ်မှတ်ပါ (ဥပမာ- 'OLED မျက်နှာပြင်လဲလှယ်ခြင်း')။",
          th: "ตั้งชื่อบริการให้ชัดเจน (เช่น 'เปลี่ยนจอแท้ OLED', 'งานซ่อมลายวงจรชาร์จ').",
        },
      },
      {
        number: 2,
        label: {
          en: "Standard Labor Fee & Estimated Duration",
          my: "စံလက်ခနှုန်းထားနှင့် ကြာမြင့်မည့် ခန့်မှန်းအချိန်",
          th: "อัตราค่าแรงมาตรฐานและระยะเวลาดำเนินการ",
        },
        desc: {
          en: "Set base labor rates and typical turnaround hours (e.g., 2 hours for battery replacement).",
          my: "မူလလက်ခ စျေးနှုန်းနှင့် ပုံမှန်ကြာမြင့်ချိန် (ဥပမာ ဘက်ထရီလဲခြင်းအတွက် ၂ နာရီ) ကို သတ်မှတ်ပါ။",
          th: "กำหนดราคาค่าแรงมาตรฐานและเวลาที่ใช้โดยประมาณ (เช่น เปลี่ยนแบตเตอรี่ใช้เวลา 2 ชั่วโมง).",
        },
      },
      {
        number: 3,
        label: {
          en: "One-Click Addition during Intake",
          my: "ပစ္စည်းလက်ခံစဉ် တစ်ချက်နှိပ် ထည့်သွင်းနိုင်ခြင်း",
          th: "ดึงราคามาใช้ได้ทันทีตอนเปิดใบงาน",
        },
        desc: {
          en: "Front desk staff can click any catalog service to instantly quote customers without guessing labor costs.",
          my: "ဝန်ထမ်းများအနေဖြင့် လက်ခကို ခန့်မှန်းရိုက်စရာမလိုဘဲ ဤလမ်းညွှန်မှတစ်ဆင့် ချက်ချင်း စျေးနှုန်း ပေးနိုင်ပါသည်။",
          th: "พนักงานหน้าร้านสามารถเลือกบริการจากรายการเพื่อแจ้งราคาลูกค้าได้ทันที ไม่ต้องเสียเวลาเดาราคาค่าแรง.",
        },
      },
    ],
    proTip: {
      en: "Standardized service catalog prevents price discrepancy conflicts between different shifts and technicians.",
      my: "စံနှုန်းထားများ ထားရှိခြင်းဖြင့် ဝန်ထမ်းအပြောင်းအလဲတွင် ဖောက်သည်များအား စျေးနှုန်းကွဲပြားမှု မဖြစ်စေရန် ကာကွယ်ပေးပါသည်။",
      th: "การมีราคากลางมาตรฐานจะช่วยป้องกันปัญหาแจ้งราคางานซ่อมไม่ตรงกันในแต่ละกะและระหว่างช่างแต่ละคน.",
    },
  },

  // 31. Repair Issue Presets
  {
    id: "repair-issue-presets",
    route: "/repairs/issue-presets",
    icon: "check",
    category: "repairs",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/repair-issue-presets.png",
    title: {
      en: "Diagnostic Fault & Symptom Issue Presets",
      my: "ချို့ယွင်းချက်နှင့် ရောဂါလက္ခဏာ စံရွေးချယ်စရာများ",
      th: "เทมเพลตอาการเสียและการตรวจวิเคราะห์โรคเครื่อง",
    },
    badge: {
      en: "Repairs Module",
      my: "ပြင်ဆင်ရေး ကဏ္ဍ",
      th: "แผนกงานซ่อม",
    },
    description: {
      en: "Preset library of customer reported complaints: 'No Power', 'Touchscreen Ghost Touches', 'Mic Noise', 'Rapid Battery Drain' for rapid touch intake.",
      my: "ဖောက်သည်များ ပြောလေ့ရှိသော ချို့ယွင်းချက်များ - 'ပါဝါမတက်'၊ 'စခရင်အထိမရ'၊ 'မိုက်ဆူညံသံပါ'၊ 'ဘက်ထရီအကုန်မြန်' စသည်တို့ကို ကြိုတင် သတ်မှတ်ထားနိုင်သော နေရာ။",
      th: "คลังข้อมูลอาการเสียที่พบบ่อย: 'เครื่องเปิดไม่ติด', 'จอสัมผัสเอง', 'ไมค์สนทนามีเสียงรบกวน', 'แบตเตอรี่หมดไวผิดปกติ' เพื่อให้แตะเลือกตอนรับเครื่องได้ทันที.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Fault Category Organization",
          my: "ချို့ယွင်းချက် အမျိုးအစား ခွဲခြားခြင်း",
          th: "จัดกลุ่มประเภทอาการเสีย",
        },
        desc: {
          en: "Group common hardware complaints by category: Power, Display, Audio, Network, or Liquid Damage.",
          my: "ပါဝါပိုင်း၊ စခရင်၊ အသံပိုင်း၊ လိုင်းပိုင်း နှင့် ရေဝင်ပျက်စီးမှု စသည်ဖြင့် အုပ်စုခွဲခြားပါ။",
          th: "จัดกลุ่มอาการเสีย: ระบบไฟ หน้าจอแสดงผล ระบบเสียง เครือข่าย หรือความชื้น/ตกน้ำ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Add New Symptom Presets (+ Add)",
          my: "လက္ခဏာအသစ် ထည့်သွင်းခြင်း (+ Add)",
          th: "เพิ่มรายการอาการเสียใหม่ (+ Add)",
        },
        desc: {
          en: "Click '+ Add' to define new diagnostic symptoms observed in common device models.",
          my: "အသစ်တွေ့ရှိရသော စက်ချို့ယွင်းချက်များကို စာရင်းတွင် ထပ်မံထည့်သွင်းရန် '+ Add' ကို နှိပ်ပါ။",
          th: "กด '+ Add' เพื่อบันทึกอาการเสียใหม่ๆ ที่เริ่มพบบ่อยในอุปกรณ์รุ่นปัจจุบัน.",
        },
      },
      {
        number: 3,
        label: {
          en: "Rapid One-Tap Selection at Intake",
          my: "ပစ္စည်းလက်ခံရာတွင် တစ်ချက်နှိပ် ရွေးချယ်နိုင်ခြင်း",
          th: "แตะเลือกง่ายตอนเปิดใบรับซ่อม",
        },
        desc: {
          en: "Technicians and cashiers tap buttons to attach symptoms without manual typing errors.",
          my: "ဝန်ထမ်းများ စာရိုက်မှားယွင်းမှု မရှိစေရန် ဤခလုတ်များကို တစ်ချက်နှိပ်ရုံဖြင့် ရွေးချယ်ထည့်သွင်းနိုင်ပါသည်။",
          th: "พนักงานรับเครื่องเพียงแตะปุ่มอาการเสียที่ตรงกับปัญหา ช่วยลดเวลาพิมพ์และตัดปัญหาการสะกดผิด.",
        },
      },
    ],
    proTip: {
      en: "Analyzing high-frequency symptoms helps you decide which replacement spare parts to stock in advance.",
      my: "အဖြစ်များဆုံး ချို့ယွင်းချက်များကို သုံးသပ်ခြင်းဖြင့် မည်သည့်အပိုပစ္စည်းများကို ကြိုတင်ဝယ်ယူထားသင့်သည်ကို သိရှိနိုင်ပါသည်။",
      th: "การดูสถิติอาการเสียที่พบบ่อยจะช่วยให้คุณวางแผนสั่งซื้ออะไหล่แท้มาสำรองไว้ในสต็อกล่วงหน้าได้อย่างตรงจุด.",
    },
  },

  // 32. Repair Condition Presets
  {
    id: "repair-condition-presets",
    route: "/repairs/condition-presets",
    icon: "eye",
    category: "repairs",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/repair-condition-presets.png",
    title: {
      en: "Device Physical Condition & Cosmetic Inspection Presets",
      my: "ပစ္စည်း ပြင်ပအခြေအနေနှင့် ပွန်းပဲ့မှု စစ်ဆေးချက် စံရွေးချယ်စရာများ",
      th: "เทมเพลตสภาพภายนอกตัวเครื่องและตำหนิรอยขีดข่วน",
    },
    badge: {
      en: "Repairs Module",
      my: "ပြင်ဆင်ရေး ကဏ္ဍ",
      th: "แผนกงานซ่อม",
    },
    description: {
      en: "Standard cosmetic condition checklist: 'Pristine Flawless', 'Minor Screen Scratches', 'Heavy Corner Dents', 'Missing Screws', 'Bent Frame' for mutual customer sign-off.",
      my: "စက်၏ ပြင်ပအခြေအနေ စစ်ဆေးချက်များ - 'အပြစ်အနာအဆာကင်း'၊ 'စခရင်အနည်းငယ်ခြစ်ရာပါ'၊ 'ထောင့်ပိန်ဖောင်း'၊ 'ဝက်အူပျောက်ဆုံး' စသည့် အချက်များကို အလွယ်တကူ သတ်မှတ်ပါ။",
      th: "รายการตรวจสอบสภาพภายนอกตัวเครื่องมาตรฐาน: 'สภาพไร้รอย', 'หน้าจอมีรอยขนแมว', 'มุมเครื่องบุบ', 'น็อตไม่ครบ', 'ตัวเครื่องงอ' เพื่อลงนามรับทราบร่วมกัน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Physical Wear Grading Definition",
          my: "ပွန်းပဲ့မှု အဆင့်အတန်းများ သတ်မှတ်ခြင်း",
          th: "กำหนดเกรดสภาพความสมบูรณ์ของตัวเครื่อง",
        },
        desc: {
          en: "Establish standard visual condition grades across body housing, display glass, and camera lenses.",
          my: "ကိုယ်ထည်၊ စခရင်မှန်နှင့် ကင်မရာမှန်ဘီလူးများ၏ အခြေအနေ အဆင့်အတန်းများကို စနစ်တကျ သတ်မှတ်ပါ။",
          th: "สร้างมาตรฐานการประเมินสภาพภายนอก ทั้งตัวบอดี้ กระจกจอ และเลนส์กล้อง.",
        },
      },
      {
        number: 2,
        label: {
          en: "Add Cosmetic Tags (+ Add)",
          my: "အခြေအနေ တံဆိပ်အသစ် ထည့်သွင်းခြင်း (+ Add)",
          th: "เพิ่มป้ายกำกับสภาพเครื่อง (+ Add)",
        },
        desc: {
          en: "Click '+ Add' to create dedicated condition presets reflecting store inspection workflows.",
          my: "ဆိုင်သုံး စစ်ဆေးမှု စနစ်နှင့် ကိုက်ညီသော စံအခြေအနေများကို ထပ်တိုးရန် '+ Add' ကို နှိပ်ပါ။",
          th: "กด '+ Add' เพื่อเพิ่มข้อความระบุสภาพเครื่องให้ครอบคลุมการตรวจสอบของร้าน.",
        },
      },
      {
        number: 3,
        label: {
          en: "Printed Customer Intake Verification",
          my: "ဖောက်သည် လက်မှတ်ထိုးမည့် စာရွက်တွင် ထည့်သွင်းပြသခြင်း",
          th: "พิมพ์ลงบนใบรับเครื่องเพื่อเป็นหลักฐาน",
        },
        desc: {
          en: "Selected physical conditions appear clearly printed on the intake slip signed by the customer upon handover.",
          my: "ရွေးချယ်ထားသော စက်အခြေအနေများကို ဖောက်သည်လက်မှတ်ထိုးရမည့် ပစ္စည်းလက်ခံပြေစာတွင် အတိအလင်း ရိုက်နှိပ်ဖော်ပြပေးမည်။",
          th: "รายการสภาพตัวเครื่องเดิมที่เลือกจะถูกพิมพ์ลงบนใบรับเครื่องอย่างชัดเจน ให้ลูกค้าเซ็นยอมรับก่อนส่งมอบ.",
        },
      },
    ],
    proTip: {
      en: "Combining physical condition tags with customer signatures eliminates false damage claims when picking up repaired devices.",
      my: "စက်အခြေအနေများကို ဖောက်သည်၏ လက်မှတ်နှင့် တွဲဖက်မှတ်တမ်းတင်ထားခြင်းဖြင့် ပစ္စည်းပြန်ယူချိန်တွင် ပြဿနာဖြစ်ပွားမှုကို အပြည့်အဝ တားဆီးပေးပါသည်။",
      th: "การมีรายการสภาพเดิมพร้อมลายเซ็นลูกค้ายืนยันตอนส่งเครื่อง จะตัดปัญหาการถูกกล่าวหาว่าทำเครื่องลูกค้าเป็นรอยได้ 100%.",
    },
  },

  // 33. Reports
  {
    id: "reports",
    route: "/reports",
    icon: "chart",
    category: "insights",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/reports.png",
    title: {
      en: "Financial & Inventory Analytics Reports Hub",
      my: "ဘဏ္ဍာရေးနှင့် ကုန်ပစ္စည်း စာရင်းအင်း အစီရင်ခံစာများ ဗဟိုချက်",
      th: "ศูนย์รวมรายงานการเงินและวิเคราะห์สต็อกสินค้า",
    },
    badge: {
      en: "Merchant Role Only",
      my: "ဆိုင်ပိုင်ရှင် သီးသန့်",
      th: "เฉพาะระดับเจ้าของร้าน",
    },
    description: {
      en: "Executive business intelligence: Gross and Net Sales, FIFO Cost of Goods Sold (COGS), Profit Margins, Best-Selling SKUs, Dead Stock Inventory, and Tax VAT Liability.",
      my: "လုပ်ငန်းသုံး အချက်အလက်များ - စုစုပေါင်း အရောင်း၊ FIFO ဝယ်ရင်းကုန်ကျစရိတ်၊ အသားတင်အမြတ်၊ အရောင်းရဆုံးပစ္စည်းများ၊ စတော့သေများ နှင့် ကုန်သွယ်လုပ်ငန်းခွန် အစီရင်ခံစာများ။",
      th: "ระบบวิเคราะห์ธุรกิจระดับผู้บริหาร: ยอดขายรวมและสุทธิ ต้นทุนสินค้าขายจริงแบบ FIFO อัตรากำไร สินค้าขายดี สินค้าค้างสต็อก และสรุปภาษีมูลค่าเพิ่ม.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Select Report Dimension & Date Range",
          my: "အစီရင်ခံစာ ကဏ္ဍနှင့် ရက်စွဲအပိုင်းအခြား ရွေးချယ်ခြင်း",
          th: "เลือกประเภทรายงานและช่วงเวลาที่ต้องการดู",
        },
        desc: {
          en: "Choose report type: Sales Profitability, Cashier Balancing, Inventory Valuation, or Repair Services.",
          my: "အမြတ်ငွေ အစီရင်ခံစာ၊ ကောင်တာ ငွေစာရင်းရှင်းတမ်း၊ ကုန်ပစ္စည်းတန်ဖိုး သို့မဟုတ် ပြင်ဆင်မှု ဝင်ငွေ စသည်ဖြင့် ရွေးချယ်ပါ။",
          th: "เลือกหัวข้อรายงาน: รายงานกำไรจากการขาย, ยอดเงินแคชเชียร์ประจำกะ, มูลค่าสต็อกคงเหลือ หรือรายได้แผนกซ่อม.",
        },
      },
      {
        number: 2,
        label: {
          en: "Inspect Revenue vs. Cost Margin Graphs",
          my: "ဝင်ငွေနှင့် ဝယ်ရင်း ကုန်ကျစရိတ် ဇယားများ စစ်ဆေးခြင်း",
          th: "วิเคราะห์กราฟเปรียบเทียบรายได้และต้นทุน",
        },
        desc: {
          en: "Visual bar charts and breakdown tables illustrate monthly revenue growth, profit margin percentages, and cashier totals.",
          my: "လအလိုက် ဝင်ငွေတိုးတက်မှု၊ အမြတ်ရာခိုင်နှုန်းနှင့် ကောင်တာအလိုက် အရောင်းပမာဏများကို ရှင်းလင်းစွာ ကြည့်ရှုပါ။",
          th: "กราฟแท่งและตารางสรุปจะแสดงอัตราการเติบโตของยอดขาย เปอร์เซ็นต์กำไรสุทธิ และยอดขายแยกตามแคชเชียร์.",
        },
      },
      {
        number: 3,
        label: {
          en: "Export Formats (Excel, CSV, PDF)",
          my: "Excel, CSV, PDF ဖိုင်များဖြင့် ထုတ်ယူခြင်း",
          th: "ส่งออกข้อมูลเป็นไฟล์ Excel, CSV หรือ PDF",
        },
        desc: {
          en: "Download comprehensive raw ledger data ready for import into external corporate accounting and audit systems.",
          my: "ပြင်ပ စာရင်းကိုင် စနစ်များသို့ ထည့်သွင်းနိုင်ရန် စာရင်း အချက်အလက် အပြည့်အစုံကို ဒေါင်းလုဒ် ရယူပါ။",
          th: "ดาวน์โหลดข้อมูลตารางตัวเลขแบบละเอียด เพื่อนำไปใช้กับโปรแกรมบัญชีภายนอกหรือส่งให้ผู้สอบบัญชี.",
        },
      },
    ],
    proTip: {
      en: "Regularly checking the Dead Stock report highlights slow-moving inventory to run clearance promotions before products become obsolete.",
      my: "Dead Stock စာရင်းကို ပုံမှန်စစ်ဆေးခြင်းဖြင့် အရောင်းထိုင်းသော ပစ္စည်းများကို လျှော့စျေးဖြင့် အမြန်ဆုံး ရောင်းချရှင်းလင်းနိုင်ပါသည်။",
      th: "การตรวจดูรายงานสินค้าค้างสต็อก (Dead Stock) เป็นประจำ จะช่วยให้คุณจัดโปรโมชันระบายของได้ทันก่อนหมดอายุหรือตกรุ่น.",
    },
  },

  // 34. Staff Accounts
  {
    id: "staff-accounts",
    route: "/staff",
    icon: "users",
    category: "manage",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/staff-accounts.png",
    title: {
      en: "Staff Directory & User Accounts Management",
      my: "ဝန်ထမ်းလမ်းညွှန်နှင့် အကောင့်များ စီမံခန့်ခွဲခြင်း",
      th: "ทำเนียบพนักงานและจัดการบัญชีผู้ใช้งาน",
    },
    badge: {
      en: "Merchant Role Only",
      my: "ဆိုင်ပိုင်ရှင် သီးသန့်",
      th: "เฉพาะระดับเจ้าของร้าน",
    },
    description: {
      en: "Maintain store team member credentials, assign operational roles (Merchant, Manager, Cashier, Technician), configure quick login PINs, and manage active session access.",
      my: "ဆိုင်တွင်းရှိ ဝန်ထမ်းအကောင့်များ၊ ရာထူးတာဝန်များ (မန်နေဂျာ၊ စာရေး၊ ကျွမ်းကျင်ပညာရှင်)၊ လျင်မြန်စွာ ဝင်ရောက်နိုင်သော PIN ကုဒ်များနှင့် အသုံးပြုခွင့်များကို စီမံခန့်ခွဲပါ။",
      th: "จัดการบัญชีพนักงานของร้าน กำหนดบทบาทหน้าที่ (เจ้าของร้าน, ผู้จัดการ, แคชเชียร์, ช่างซ่อม) ตั้งรหัส PIN เข้างานด่วน และควบคุมสิทธิ์การใช้งาน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Staff Directory & Role Overview",
          my: "ဝန်ထမ်းစာရင်းနှင့် ရာထူးတာဝန်များ အကျဉ်းချုပ်",
          th: "รายชื่อพนักงานและบทบาทหน้าที่",
        },
        desc: {
          en: "Review active employee profiles, assigned branch locations, contact phone numbers, and security privilege levels.",
          my: "လက်ရှိ ဝန်ထမ်းများ၊ တာဝန်ကျ ဆိုင်ခွဲ၊ ဖုန်းနံပါတ်နှင့် လုံခြုံရေး အဆင့်အတန်းများကို စစ်ဆေးပါ။",
          th: "ดูรายชื่อพนักงานปัจจุบัน สาขาที่สังกัด เบอร์โทรศัพท์ติดต่อ และระดับสิทธิ์ความปลอดภัยในระบบ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Invite New Team Member (+ Add)",
          my: "ဝန်ထမ်းအသစ် ထည့်သွင်းဖိတ်ခေါ်ခြင်း (+ Add)",
          th: "เพิ่มหรือเชิญพนักงานใหม่ (+ Add)",
        },
        desc: {
          en: "Click '+ Add' to invite a staff member by email, configure their starting password, and assign their job designation.",
          my: "အီးမေးလ်ဖြင့် ဝန်ထမ်းအသစ် ထည့်သွင်းရန်၊ လျှို့ဝှက်နံပါတ် သတ်မှတ်ရန်နှင့် ရာထူးပေးရန် '+ Add' ကို နှိပ်ပါ။",
          th: "กดปุ่ม '+ Add' เพื่อสร้างบัญชีพนักงานใหม่ กำหนดรหัสผ่านเริ่มต้น และเลือกระดับหน้าที่การทำงาน.",
        },
      },
      {
        number: 3,
        label: {
          en: "Assign Quick PIN for Fast Workstation Switch",
          my: "ကောင်တာ အမြန်ပြောင်းရန် PIN ကုဒ် သတ်မှတ်ခြင်း",
          th: "ตั้งรหัส PIN 4 หลักสำหรับสลับผู้ใช้งานด่วน",
        },
        desc: {
          en: "Assign a 4-digit PIN for rapid cashier workstation switching between shifts without re-entering long master passwords.",
          my: "ဘရောက်ဇာမှ ထွက်ရန်မလိုဘဲ ဝန်ထမ်းအပြောင်းအလဲတွင် အလွယ်တကူ ကောင်တာပြောင်းသုံးနိုင်ရန် ၄ လုံးကုဒ် PIN ထားရှိပါ။",
          th: "ตั้งรหัส PIN 4 หลัก เพื่อให้สลับหน้าแคชเชียร์ระหว่างกะได้อย่างรวดเร็วโดยไม่ต้องพิมพ์รหัสผ่านยาวๆ.",
        },
      },
    ],
    proTip: {
      en: "Cashiers should be assigned their own unique accounts so the Transaction Ledger accurately attributes every sale and void to the responsible individual.",
      my: "အရောင်းမှတ်တမ်းတွင် မည်သူရောင်းချခဲ့သည်ကို တိကျစွာ သိရှိနိုင်ရန် စာရေးတစ်ဦးချင်းစီအတွက် ကိုယ်ပိုင် အကောင့်များ ထားရှိပေးပါ။",
      th: "ควรสร้างบัญชีแยกให้แคชเชียร์ทุกคน เพื่อให้ประวัติการขายและบิลที่ยกเลิกระบุชื่อผู้ทำรายการได้อย่างถูกต้อง ชัดเจน.",
    },
  },

  // 35. Settings Staff
  {
    id: "settings-staff",
    route: "/settings/staff",
    icon: "lock",
    category: "manage",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/settings-staff.png",
    title: {
      en: "Staff Role Permissions & Workstation Access Matrix",
      my: "ဝန်ထမ်း ရာထူးအလိုက် လုပ်ပိုင်ခွင့်များနှင့် စနစ်အသုံးပြုခွင့် မက်ထရစ်",
      th: "การตั้งค่าสิทธิ์ตามบทบาทและการเข้าถึงเครื่องทำงาน",
    },
    badge: {
      en: "Merchant Role Only",
      my: "ဆိုင်ပိုင်ရှင် သီးသန့်",
      th: "เฉพาะระดับเจ้าของร้าน",
    },
    description: {
      en: "Granular access control matrix: configure role-based permissions (viewing cost prices, processing order refunds, applying manual discounts, exporting data).",
      my: "ရာထူးအလိုက် လုပ်ပိုင်ခွင့်များ - ဝယ်ရင်းစျေး ကြည့်ရှုခွင့်၊ ငွေပြန်အမ်းခွင့်၊ လက်ဖြင့် လျှော့စျေးပေးခွင့် နှင့် ဒေတာထုတ်ယူခွင့်များကို စနစ်တကျ ကန့်သတ်နိုင်သော နေရာ။",
      th: "ตารางกำหนดสิทธิ์เชิงลึก: ตั้งค่าสิทธิ์ตามบทบาท (การดูราคาต้นทุน, สิทธิ์ในการคืนเงิน, สิทธิ์ให้ส่วนลดพิเศษ, สิทธิ์ส่งออกข้อมูล).",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Select Role Group to Configure",
          my: "လုပ်ပိုင်ခွင့် သတ်မှတ်မည့် ရာထူးအုပ်စုကို ရွေးချယ်ခြင်း",
          th: "เลือกกลุ่มบทบาทที่ต้องการตั้งค่า",
        },
        desc: {
          en: "Choose between Manager, Cashier, Technician, or Inventory Clerk to review and toggle individual permissions.",
          my: "မန်နေဂျာ၊ စာရေး၊ ပြင်ဆင်ရေးကျွမ်းကျင်သူ သို့မဟုတ် ကုန်လှောင်ရုံစာရေး စသည့် ရာထူးများ၏ လုပ်ပိုင်ခွင့်များကို ရွေးချယ်စစ်ဆေးပါ။",
          th: "เลือกกลุ่มบทบาท: ผู้จัดการ แคชเชียร์ ช่างซ่อม หรือเจ้าหน้าที่คลัง เพื่อเปิด/ปิดสิทธิ์ทีละรายการ.",
        },
      },
      {
        number: 2,
        label: {
          en: "Toggle Sensitive Business Permissions",
          my: "အရေးကြီးသော လုပ်ပိုင်ခွင့်များကို အဖွင့်/အပိတ် ပြုလုပ်ခြင်း",
          th: "เปิด/ปิดสิทธิ์การทำงานที่สำคัญ",
        },
        desc: {
          en: "Enable or restrict sensitive capabilities: 'Can View Cost Prices', 'Can Void Orders', 'Can Modify Settings'.",
          my: "'ဝယ်ရင်းစျေး ကြည့်ခွင့်'၊ 'ဘောက်ချာဖျက်သိမ်းခွင့်'၊ 'ဆက်တင်များ ပြင်ဆင်ခွင့်' စသည့် အရေးကြီး လုပ်ပိုင်ခွင့်များကို သတ်မှတ်ပါ။",
          th: "เปิดหรือล็อกการเข้าถึงฟังก์ชันสำคัญ: 'ดูต้นทุนสินค้าได้', 'ยกเลิกบิลขายได้', 'เข้าแก้ไขการตั้งค่าได้'.",
        },
      },
      {
        number: 3,
        label: {
          en: "Save & Enforce Across Terminals",
          my: "သိမ်းဆည်း၍ ကောင်တာစက်များအားလုံးတွင် အသက်သွင်းခြင်း",
          th: "บันทึกและบังคับใช้กับทุกเครื่องทันที",
        },
        desc: {
          en: "Click save to push updated permission policies immediately across all active browser and tablet sessions.",
          my: "သိမ်းဆည်းလိုက်သည်နှင့် အသုံးပြုနေသော ကောင်တာစက်များနှင့် တက်ဘလက်များအားလုံးတွင် ချက်ချင်း အသက်ဝင်သွားပါမည်။",
          th: "กดบันทึกเพื่อให้การปรับปรุงสิทธิ์มีผลกับหน้าจอเบราว์เซอร์และแท็บเล็ตของพนักงานทุกคนทันที.",
        },
      },
    ],
    proTip: {
      en: "Restricting cashiers from seeing acquisition cost prices prevents sensitive supplier margins from being leaked to competitors.",
      my: "စာရေးများအား ဝယ်ရင်းစျေး မမြင်နိုင်အောင် ပိတ်ထားခြင်းဖြင့် ဆိုင်၏ အမြတ်ငွေ အချက်အလက် မပေါက်ကြားစေရန် ကာကွယ်နိုင်ပါသည်။",
      th: "การปิดสิทธิ์ไม่ให้แคชเชียร์เห็นราคาต้นทุน จะช่วยรักษาความลับทางการค้าและอัตรากำไรของร้านไม่ให้รั่วไหล.",
    },
  },

  // 36. Settings System
  {
    id: "settings-system",
    route: "/settings",
    icon: "settings",
    category: "manage",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/settings-system.png",
    title: {
      en: "System Settings - Store Identity & General Preferences",
      my: "စနစ် ဆက်တင်များ - စတိုးဆိုင် အချက်အလက်နှင့် အထွေထွေ ဆက်တင်များ",
      th: "การตั้งค่าระบบ - ข้อมูลร้านค้าและการตั้งค่าทั่วไป",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Configure primary store parameters: store business name, tax registration number, default operating currency, time zone, and POS complexity mode selection (Mini, Simple, Complex).",
      my: "ဆိုင်အမည်၊ အခွန်မှတ်ပုံတင်အမှတ်၊ မူလသုံးစွဲမည့် ငွေကြေး၊ ဒေသစံတော်ချိန်နှင့် POS စနစ် မုဒ်ရွေးချယ်မှု (Mini, Simple, Complex) များကို သတ်မှတ်ပါ။",
      th: "ตั้งค่าหลักของร้านค้า: ชื่อร้านค้า เลขทะเบียนพาณิชย์/ภาษี สกุลเงินหลัก เขตเวลา และเลือกระดับความซับซ้อนของระบบ POS (Mini, Simple, Complex).",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Store Name & Receipt Header",
          my: "ဆိုင်အမည်နှင့် ပြေစာထိပ်စီး စာသားများ",
          th: "ชื่อร้านค้าและข้อความหัวใบเสร็จ",
        },
        desc: {
          en: "Define the official trading name, branch address, and phone number printed on customer thermal receipts.",
          my: "ဖောက်သည်များထံ ပေးအပ်မည့် ပြေစာတွင် ဖော်ပြမည့် ဆိုင်အမည်၊ လိပ်စာနှင့် ဆက်သွယ်ရန် ဖုန်းနံပါတ်များကို ထည့်သွင်းပါ။",
          th: "ระบุชื่อร้านค้าอย่างเป็นทางการ ที่อยู่สาขา และเบอร์โทรศัพท์ที่จะพิมพ์ลงบนหัวใบเสร็จรับเงิน.",
        },
      },
      {
        number: 2,
        label: {
          en: "Operating Currency & Tax Percentage",
          my: "သုံးစွဲမည့် ငွေကြေးနှင့် ကုန်သွယ်ခွန် ရာခိုင်နှုန်း",
          th: "สกุลเงินที่ใช้และอัตราภาษีมูลค่าเพิ่ม",
        },
        desc: {
          en: "Select shop currency (USD, MMK, THB) and configure default sales tax rate automatically included at checkout.",
          my: "ဆိုင်သုံး ငွေကြေး (USD, MMK, THB) ကို ရွေးချယ်ပြီး အရောင်းတွင် အလိုအလျောက် ထည့်သွင်းမည့် အခွန်ရာခိုင်နှုန်းကို သတ်မှတ်ပါ။",
          th: "เลือกสกุลเงินหลักของร้าน (USD, MMK, THB) และกำหนดอัตราภาษีมาตรฐานที่จะคำนวณในหน้าคิดเงิน.",
        },
      },
      {
        number: 3,
        label: {
          en: "POS Complexity Level Mode Switching",
          my: "POS မုဒ် အပြောင်းအလဲ ပြုလုပ်ခြင်း",
          th: "สลับโหมดความซับซ้อนของ POS",
        },
        desc: {
          en: "Switch between POS Mini (High-speed single tap), POS Simple (Retail categories), and POS Complex (Enterprise matrices).",
          my: "မိမိဆိုင်၏ လုပ်ငန်းသဘာဝနှင့် ကိုက်ညီသော POS မုဒ် (Mini, Simple, Complex) ကို စိတ်ကြိုက် ပြောင်းလဲ အသုံးပြုနိုင်ပါသည်။",
          th: "เลือกโหมดจุดขายที่เหมาะกับธุรกิจ: POS Mini (คิดเงินด่วน), POS Simple (ร้านค้าปลีก) หรือ POS Complex (องค์กรขนาดใหญ่).",
        },
      },
    ],
    proTip: {
      en: "Switching the POS complexity mode automatically filters the visual cards in this Quick Guide so staff only study relevant screens.",
      my: "POS မုဒ်ကို ပြောင်းလဲလိုက်ပါက ဤလမ်းညွှန် စာမျက်နှာတွင်လည်း သက်ဆိုင်သော လမ်းညွှန်များကိုသာ သီးသန့် ပြသပေးမည် ဖြစ်ပါသည်။",
      th: "เมื่อเปลี่ยนโหมด POS ระบบจะกรองคู่มือในหน้านี้ให้แสดงเฉพาะขั้นตอนที่ตรงกับโหมดที่คุณเลือกใช้ทันที.",
    },
  },

  // 37. Settings Printer
  {
    id: "settings-printer",
    route: "/settings/printer",
    icon: "printer",
    category: "manage",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/settings-printer.png",
    title: {
      en: "Thermal Receipt Printer Pairing & ESC/POS Setup",
      my: "အပူပေး ပြေစာပရင်တာ ချိတ်ဆက်မှုနှင့် ESC/POS ဆက်တင်များ",
      th: "การตั้งค่าเครื่องพิมพ์ใบเสร็จความร้อนและคำสั่ง ESC/POS",
    },
    badge: {
      en: "Hardware Setup",
      my: "စက်ပစ္စည်း ချိတ်ဆက်မှု",
      th: "ตั้งค่าฮาร์ดแวร์",
    },
    description: {
      en: "Pair Bluetooth, USB, or Network LAN receipt printers. Select paper widths (80mm standard or 58mm compact), test raw print output, and configure auto-cash drawer kick.",
      my: "ဘလူးတုသ်၊ USB သို့မဟုတ် Network LAN ပြေစာပရင်တာများ ချိတ်ဆက်ပါ။ စက္ကူအရွယ်အစား (၈၀ မမ သို့မဟုတ် ၅၈ မမ) ရွေးချယ်ပြီး အံဆွဲပွင့်ခလုတ်များကို ချိန်ညှိပါ။",
      th: "เชื่อมต่อเครื่องพิมพ์ใบเสร็จความร้อนผ่านบลูทูธ USB หรือสาย LAN เลือกขนาดหน้ากระดาษ (80 มม. หรือ 58 มม.) ทดสอบการพิมพ์ และสั่งเปิดลิ้นชักเก็บเงิน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Select Connection Interface",
          my: "ချိတ်ဆက်မည့် လမ်းကြောင်း ရွေးချယ်ခြင်း",
          th: "เลือกช่องทางการเชื่อมต่อเครื่องพิมพ์",
        },
        desc: {
          en: "Pair a wireless Bluetooth mobile printer, connect via WebUSB, or input IP address for a shared network receipt printer.",
          my: "ကြိုးမဲ့ ဘလူးတုသ်၊ WebUSB သို့မဟုတ် ဆိုင်သုံး ကွန်ရက် IP လိပ်စာ ထည့်သွင်း၍ ပရင်တာကို ချိတ်ဆက်ပါ။",
          th: "จับคู่ผ่านบลูทูธไร้สาย เชื่อมต่อผ่าน WebUSB หรือกรอกหมายเลข IP สำหรับเครื่องพิมพ์ที่แชร์ในระบบเครือข่าย.",
        },
      },
      {
        number: 2,
        label: {
          en: "Paper Roll Width & Character Density",
          my: "စက္ကူလိပ် အကျယ်နှင့် စာလုံးအရွယ်အစား သတ်မှတ်ခြင်း",
          th: "ขนาดหน้ากว้างกระดาษและความหนาแน่นตัวอักษร",
        },
        desc: {
          en: "Select 80mm standard wide receipt format or 58mm compact mobile format with logo printing options.",
          my: "၈၀ မမ စံပြေစာပုံစံ သို့မဟုတ် ၅၈ မမ အိတ်ဆောင်ပြေစာပုံစံကို လိုဂိုတံဆိပ်နှင့်အတူ စိတ်ကြိုက် ချိန်ညှိပါ။",
          th: "เลือกขนาดกระดาษ 80 มม. (แบบมาตรฐาน) หรือ 58 มม. (แบบพกพา) พร้อมตัวเลือกพิมพ์โลโก้ร้าน.",
        },
      },
      {
        number: 3,
        label: {
          en: "Test Receipt & Cash Drawer Kick Trigger",
          my: "စမ်းသပ်စာရွက် ထုတ်ကြည့်ခြင်းနှင့် ငွေအံဆွဲ အလိုအလျောက် ပွင့်စေခြင်း",
          th: "พิมพ์ทดสอบและทดสอบการเปิดลิ้นชักเก็บเงิน",
        },
        desc: {
          en: "Run a sample print test and enable the cash drawer kick pulse command triggered after every completed cash checkout.",
          my: "စမ်းသပ်စာရွက် ထုတ်ကြည့်ပါ၊ ငွေသားဖြင့် အရောင်းပြီးဆုံးတိုင်း ငွေအံဆွဲ အလိုအလျောက် ပွင့်စေမည့် ခလုတ်ကို ဖွင့်ထားပါ။",
          th: "กดพิมพ์ใบเสร็จทดสอบ และเปิดคำสั่งเด้งลิ้นชักเก็บเงินอัตโนมัติทุกครั้งที่แคชเชียร์รับชำระเงินสดสำเร็จ.",
        },
      },
    ],
    proTip: {
      en: "Web Bluetooth allows tablets and laptops to print receipts without installing complex external printer drivers.",
      my: "Web Bluetooth ကို အသုံးပြုခြင်းဖြင့် အပိုဒရိုင်ဘာများ ထည့်သွင်းရန်မလိုဘဲ တက်ဘလက်များမှ ပြေစာ တိုက်ရိုက် ထုတ်ယူနိုင်ပါသည်။",
      th: "ระบบ Web Bluetooth ช่วยให้แท็บเล็ตและแล็ปท็อปสั่งพิมพ์ใบเสร็จได้โดยตรง ไม่ต้องลงไดรเวอร์เพิ่มเติมให้ยุ่งยาก.",
    },
  },

  // 38. Settings Language
  {
    id: "settings-language",
    route: "/settings/language",
    icon: "globe",
    category: "manage",
    posComplexityLevel: "ALL",
    screenshot: "/guide-screenshots/settings-language.png",
    title: {
      en: "Multi-Language Localization & Region Settings",
      my: "ဘာသာစကားမျိုးစုံနှင့် ဒေသဆိုင်ရာ ဆက်တင်များ",
      th: "การตั้งค่าหลายภาษาและการแปลภาษาประจำภูมิภาค",
    },
    badge: {
      en: "All POS Modes",
      my: "မုဒ်အားလုံး",
      th: "ทุกโหมด POS",
    },
    description: {
      en: "Instant localized user interface switching: English, Myanmar (Burmese), and Thai across all cashier screens, navigation menus, and operational guide cards.",
      my: "အင်္ဂလိပ်၊ မြန်မာ နှင့် ထိုင်း ဘာသာစကားများကို ခလုတ်တစ်ချက်နှိပ်ရုံဖြင့် မီနူးများ၊ အရောင်းကောင်တာနှင့် လမ်းညွှန်များ အားလုံးတွင် ချက်ချင်း ပြောင်းလဲနိုင်သော နေရာ။",
      th: "สลับภาษาหน้าจอการทำงานได้ทันที: รองรับภาษาอังกฤษ ภาษาพม่า และภาษาไทย ในทุกหน้าจอแคชเชียร์ เมนูระบบ และการ์ดคู่มือการใช้งาน.",
    },
    steps: [
      {
        number: 1,
        label: {
          en: "Choose Primary System Language",
          my: "အဓိက သုံးစွဲမည့် ဘာသာစကားကို ရွေးချယ်ခြင်း",
          th: "เลือกภาษาหลักของระบบ",
        },
        desc: {
          en: "Select English, Myanmar (Unicode standard), or Thai for the current user session.",
          my: "မိမိ အသုံးပြုလိုသော အင်္ဂလိပ်၊ မြန်မာ (ယူနီကုဒ်စံ) သို့မဟုတ် ထိုင်း ဘာသာစကားကို ရွေးချယ်ပါ။",
          th: "เลือกภาษาที่ต้องการ: อังกฤษ พม่า (มาตรฐานยูนิโค้ด) หรือไทย สำหรับการใช้งานปัจจุบัน.",
        },
      },
      {
        number: 2,
        label: {
          en: "Instant UI Update Without Page Reload",
          my: "စာမျက်နှာ ပြန်ဖွင့်ရန်မလိုဘဲ ချက်ချင်း ပြောင်းလဲခြင်း",
          th: "อัปเดตภาษาของหน้าจอทันทีโดยไม่ต้องโหลดใหม่",
        },
        desc: {
          en: "All button labels, navigation sidebars, modals, and tutorial steps change language instantly without losing cart items.",
          my: "ရွေးချယ်ထားသော ခြင်းတောင်းမပျက်ဘဲ မီနူးများ၊ ခလုတ်များနှင့် လမ်းညွှန်များအားလုံး ဘာသာစကား ချက်ချင်း ပြောင်းလဲသွားမည်။",
          th: "ปุ่ม เมนูด้านข้าง หน้าต่างป๊อปอัป และคู่มือจะเปลี่ยนภาษาทันที โดยที่สินค้าในตะกร้าไม่สูญหาย.",
        },
      },
      {
        number: 3,
        label: {
          en: "Dual-Language Receipt Printing",
          my: "ဘာသာစကား နှစ်မျိုးတွဲ ပြေစာ ရိုက်နှိပ်ခြင်း",
          th: "พิมพ์ใบเสร็จสองภาษา",
        },
        desc: {
          en: "Configure customer receipts to print item descriptions in both the local language and English for cross-border clients.",
          my: "နယ်စပ်ကုန်သွယ်ရေးနှင့် နိုင်ငံခြားသား ဖောက်သည်များအတွက် ပြေစာတွင် ပြည်တွင်းဘာသာနှင့် အင်္ဂလိပ် နှစ်မျိုးတွဲ ဖော်ပြနိုင်ပါသည်။",
          th: "ตั้งค่าให้ใบเสร็จพิมพ์ชื่อสินค้าทั้งภาษาท้องถิ่นและภาษาอังกฤษควบคู่กัน เหมาะสำหรับลูกค้าต่างชาติและร้านค้าชายแดน.",
        },
      },
    ],
    proTip: {
      en: "You can also switch language at any time using the language dropdown selector in the top navigation bar header.",
      my: "စာမျက်နှာထိပ်ရှိ ဘာသာစကား ရွေးချယ်မှု မီနူးမှလည်း အချိန်မရွေး လွယ်ကူစွာ ပြောင်းလဲနိုင်ပါသည်။",
      th: "คุณสามารถสลับภาษาการใช้งานได้ทุกเวลาผ่านเมนูเลือกภาษาที่แถบด้านบนสุดของหน้าจอ.",
    },
  },
];

// Generate TypeScript code
const tsContent = `import type { IconName } from "@/components/icons";

export type LocalizedText = {
  en: string;
  my: string;
  th: string;
};

export type GuideStep = {
  number: number;
  label: LocalizedText;
  desc: LocalizedText;
};

export type GuideSection = {
  id: string;
  route: string;
  icon: IconName;
  category: "overview" | "operations" | "repairs" | "insights" | "manage";
  posComplexityLevel: "ALL" | "MINI" | "SIMPLE" | "COMPLEX";
  screenshot: string;
  title: LocalizedText;
  badge: LocalizedText;
  description: LocalizedText;
  steps: GuideStep[];
  proTip: LocalizedText;
  shortcutHint?: string;
};

export const GUIDE_CATEGORIES: { id: string; label: LocalizedText; icon: IconName }[] = [
  {
    id: "overview",
    label: {
      en: "Overview & POS Registers",
      my: "အကျဉ်းချုပ်နှင့် အရောင်းကောင်တာ (POS)",
      th: "ภาพรวมและจุดขายหน้าร้าน (POS)",
    },
    icon: "home",
  },
  {
    id: "operations",
    label: {
      en: "Catalog, Stock & Sales",
      my: "ကုန်ပစ္စည်း၊ ကုန်လှောင်ရုံနှင့် အရောင်းများ",
      th: "แคตตาล็อก สต็อก และการขาย",
    },
    icon: "package",
  },
  {
    id: "repairs",
    label: {
      en: "Device Repairs & Service",
      my: "ပစ္စည်းပြင်ဆင်မှု ဝန်ဆောင်မှုစင်တာ",
      th: "ศูนย์บริการและงานซ่อมอุปกรณ์",
    },
    icon: "repair",
  },
  {
    id: "insights",
    label: {
      en: "Invoices, Reports & Promos",
      my: "ပြေစာများ၊ အစီရင်ခံစာနှင့် ပရိုမိုးရှင်း",
      th: "ใบแจ้งหนี้ รายงาน และโปรโมชัน",
    },
    icon: "chart",
  },
  {
    id: "manage",
    label: {
      en: "Staff Accounts & Settings",
      my: "ဝန်ထမ်းအကောင့်များနှင့် ဆက်တင်များ",
      th: "บัญชีพนักงานและการตั้งค่าระบบ",
    },
    icon: "settings",
  },
];

export const GUIDE_SECTIONS: GuideSection[] = ${JSON.stringify(sections, null, 2)};
`;

const outputPath = path.resolve("./lib/guide-data.ts");
fs.writeFileSync(outputPath, tsContent, "utf8");
console.log(`Successfully generated ${sections.length} guide sections in ${outputPath}`);
