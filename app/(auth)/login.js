'use client';

import Login_form from "@/components/(layout)/login";
import Image from "next/image";
import { Svg_Facebook, Svg_Website } from "@/components/(icon)/svg";
import Link from "next/link";


export default function Layout_Login() {
  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <div style={{ width: 400, alignItems: 'center', maxHeight: '100%', justifyContent: 'space-between' }} className="flex_col scroll">
        <div style={{ width: '100%', alignItems: 'center' }} className="flex_col">
          <div style={{ margin: '30px 0', width: '80%' }}>
            <p style={{ fontWeight: 700, color: 'var(--text)', fontSize: 32, textAlign: 'center' }}>
              <span style={{ color: 'var(--main_d)' }}>BLING KIM</span> SALE</p>
            <h5 style={{ marginTop: '-4px', textAlign: 'center' }}>Thẩm mỹ y khoa cá nhân hoá

Nơi vẻ đẹp của bạn được tôn vinh

như một tác phẩm nghệ thuật.</h5>
          </div>
          <Login_form />
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Image src='https://lh3.googleusercontent.com/d/1jEyhFxHD4PllLVPTDjIfF5AeT4x0OYqL' priority fill style={{ objectFit: "cover" }} alt="Full screen image" />
      </div>
    </div >
  )
}

