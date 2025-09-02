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
              <span style={{ color: 'var(--main_d)' }}>SALE</span> ITRAIL</p>
            <h5 style={{ marginTop: '-4px', textAlign: 'center' }}>Giải pháp kết nối khách hàng cho doanh nghiệp thông qua ứng dụng Zalo</h5>
          </div>
          <Login_form />
        </div>
        <div style={{ width: 'calc(100% - 64px)' }}>
          <p className='text_5_400'>Theo dõi tại</p>
          <div style={{ height: 1, background: 'var(--border-color)', width: '100%', margin: '5px 0' }}></div>
          <div className="flex_col" style={{ gap: 5, padding: '12px 0 16px 0' }}>
            <Link href='https://www.facebook.com/airobotic.edu.vn' target="_blank">
              <div className="button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'start', gap: 8, width: '100%' }}>
                <span></span><span></span><span></span><span></span>
                <Svg_Facebook h={20} w={20} c={'white'} />  <h6 className="text_5" style={{ color: 'white' }}>Trang Facebook chính thức </h6>
              </div>
            </Link >
            <Link href='https://s4h.edu.vn/' target="_blank">
              <div className="button" style={{ display: 'flex', alignItems: 'center', justifyContent: 'start', gap: 8, width: '100%' }}>
                <span></span><span></span><span></span><span style={{ background: '#696969' }}></span>
                <Svg_Website h={20} w={20} c={'white'} />  <h6 className="text_5" style={{ color: 'white' }}>Website chính thức</h6>
              </div>
            </Link>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <Image src='https://lh3.googleusercontent.com/d/1sabbN5lI9r1HfaTQ7649xkdCj2MpyL45' priority fill style={{ objectFit: "cover" }} alt="Full screen image" />
      </div>
    </div >
  )
}

