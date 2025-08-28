'use client';
import { useState, useEffect, useMemo, startTransition, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import air from './index.module.css';
import { Svg_Dark, Svg_Left, Svg_Logout, Svg_Menu, Svg_Mode, Svg_Setting, Svg_Chart } from '../../(icon)/svg'; // Bỏ các icon không dùng
import Menu from '../../(ui)/(button)/menu';
import Switch from "@/components/(ui)/(button)/swith";
import WrapIcon from '../../(ui)/(button)/hoveIcon';
import Loading from '@/components/(ui)/(loading)/loading';
import Link from 'next/link';
import FlexiblePopup from '@/components/(features)/(popup)/popup_right';
import { student_data, user_data } from '@/data/actions/get';
import Image from 'next/image';
import { driveImage } from '@/function';

// SVG_More không còn được sử dụng ở đây
// const Svg_More = ...

const Svg_Search = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" {...props}>
    <path d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z" />
  </svg>
);

const ITEM_HEIGHT = 82;
const initialNavItems = [
  {
    href: '/client', icon: <div style={{ marginBottom: 1 }}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512" height={19} width={20} fill={'var(--text-secondary)'} >
        <path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512l388.6 0c10 0 18.8-4.9 24.2-12.5l-99.2-99.2c-14.9-14.9-23.3-35.1-23.3-56.1l0-33c-15.9-4.7-32.8-7.2-50.3-7.2l-91.4 0zM384 224c-17.7 0-32 14.3-32 32l0 82.7c0 17 6.7 33.3 18.7 45.3L478.1 491.3c18.7 18.7 49.1 18.7 67.9 0l73.4-73.4c18.7-18.7 18.7-49.1 0-67.9L512 242.7c-12-12-28.3-18.7-45.3-18.7L384 224zm24 80a24 24 0 1 1 48 0 24 24 0 1 1 -48 0z" />
      </svg>
    </div>, content: 'Chăm sóc'
  },
  { href: '/', icon: <Svg_Chart h={22} w={22} c={'var(--text-secondary)'} />, content: 'Thống kê' }
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [orderedItems, setOrderedItems] = useState(initialNavItems);
  // Bỏ state và logic liên quan đến việc đếm và ẩn item
  // const [visibleCount, setVisibleCount] = useState(initialNavItems.length);
  // const [isMorePopupOpen, setIsMorePopupOpen] = useState(false);
  const [isSearchPopupOpen, setIsSearchPopupOpen] = useState(false);
  const navContainerRef = useRef(null);
  const draggedItem = useRef(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const savedOrder = localStorage.getItem('navItemOrder');
    if (savedOrder) {
      try {
        const orderedHrefs = JSON.parse(savedOrder);
        const newOrderedItems = orderedHrefs
          .map(href => initialNavItems.find(item => item.href === href))
          .filter(Boolean);
        initialNavItems.forEach(item => {
          if (!newOrderedItems.find(i => i.href === item.href)) {
            newOrderedItems.push(item);
          }
        });
        setOrderedItems(newOrderedItems);
      } catch (e) {
        console.error("Failed to parse nav item order from localStorage", e);
        setOrderedItems(initialNavItems);
      }
    } else {
      setOrderedItems(initialNavItems);
    }
  }, []);

  useEffect(() => {
    if (!isSearchPopupOpen) return;
    const handler = setTimeout(async () => {
      if (searchTerm.trim() === '') {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      try {
        const [students, users] = await Promise.all([student_data(), user_data({})]);
        const lowerCaseTerm = searchTerm.toLowerCase();
        const filteredStudents = students
          .filter(s => s.Name.toLowerCase().includes(lowerCaseTerm))
          .map(s => ({ ...s, type: 'Học sinh' }));
        const filteredUsers = users
          .filter(u => u.name.toLowerCase().includes(lowerCaseTerm))
          .map(u => ({ ...u, type: 'Giáo viên' }));
        setSearchResults([...filteredStudents, ...filteredUsers]);
      } catch (error) {
        console.error("Error fetching search data:", error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm, isSearchPopupOpen]);

  useEffect(() => {
    if (!isSearchPopupOpen) {
      setSearchTerm('');
      setSearchResults([]);
    }
  }, [isSearchPopupOpen]);

  // Bỏ useEffect tính toán visibleCount

  // Hiển thị tất cả các item trong menu, không còn logic ẩn/hiện
  const itemsToDisplay = orderedItems;

  const activeIndex = useMemo(() => {
    const activeItem = orderedItems.find(item => pathname.startsWith(item.href) && item.href !== '/' && item.href !== '/search') ||
      (pathname === '/' && orderedItems.find(item => item.href === '/'));
    return activeItem ? orderedItems.findIndex(i => i.href === activeItem.href) : -1;
  }, [pathname, orderedItems]);

  const targetOffset = activeIndex * ITEM_HEIGHT;
  const [barOffset, setBarOffset] = useState(targetOffset);

  useEffect(() => {
    setBarOffset(targetOffset);
  }, [targetOffset]);

  const [activeMenu, setActiveMenu] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
      setIsDark(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const newTheme = !prev;
      if (newTheme) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
      }
      return newTheme;
    });
  };

  const [load, setload] = useState(false);
  const logout = async () => {
    setload(true);
    try {
      await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setload(false);
      window.location.reload();
    }
  };

  const handleNavItemClick = (href) => {
    if (href === '/search') {
      setIsSearchPopupOpen(true);
    } else {
      startTransition(() => router.push(href));
    }
  };

  const handleDragStart = (e, position) => {
    draggedItem.current = position;
  };

  const handleDragEnter = (e, position) => {
    if (draggedItem.current === null || dragOverIndex === position) return;
    setDragOverIndex(position);
  };

  const handleDrop = () => {
    if (draggedItem.current === null || dragOverIndex === null) return;
    const newItems = [...orderedItems];
    const draggedItemContent = newItems[draggedItem.current];
    newItems.splice(draggedItem.current, 1);
    newItems.splice(dragOverIndex, 0, draggedItemContent);
    draggedItem.current = null;
    setDragOverIndex(null);
    setOrderedItems(newItems);
    localStorage.setItem('navItemOrder', JSON.stringify(newItems.map(item => item.href)));
  };

  const handleDragEnd = () => {
    draggedItem.current = null;
    setDragOverIndex(null);
  };

  // Logic render danh sách reorder vẫn được giữ lại dù không còn popup "Thêm" để gọi nó
  const renderReorderList = (items) => (
    <div onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} onDragEnd={handleDragEnd}>
      <p className={air.popupDescription}>Kéo và thả để sắp xếp lại menu.</p>
      <div>
        {items.reduce((acc, item, index) => {
          const isDragging = draggedItem.current === index;
          const isDropTarget = dragOverIndex === index;
          if (isDropTarget) {
            acc.push(<div key={`placeholder-${index}`} className={air.placeholder} />);
          }
          acc.push(
            <div
              key={item.href}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnter={(e) => handleDragEnter(e, index)}
              onClick={() => handleNavItemClick(item.href)}
              className={`${air.reorderItem} ${isDragging ? air.isDragging : ''}`}
            >
              {item.icon}
              <h6>{item.content}</h6>
            </div>
          );
          return acc;
        }, [])}
        {dragOverIndex === items.length && (
          <div key="placeholder-end" className={air.placeholder} />
        )}
        <div
          className={air.lastDropZone}
          onDragEnter={() => {
            if (draggedItem.current !== null) {
              setDragOverIndex(items.length);
            }
          }}
        />
      </div>
    </div>
  );

  const renderSearchContent = () => (
    <div className={air.searchContainer}>
      <input
        type="text"
        placeholder="Tìm kiếm theo tên..."
        className='input'
        value={searchTerm}
        style={{ width: 'calc(100% - 24px)', marginBottom: 8 }}
        onChange={(e) => setSearchTerm(e.target.value)}
        autoFocus
      />
      <div className={air.resultsContainer}>
        {isSearching ? (
          <div className={air.searchLoading}>
            <Loading content={<p className='text_6_400' style={{ color: 'var(--text-primary)' }}>Đang tìm kiếm...</p>} />
          </div>
        ) : (
          searchResults.map((result) => {
            return <Link href={`/${result._id}`} className={air.ItemWrap} key={result._id} onClick={() => setIsSearchPopupOpen(false)}>
              <div style={{ width: 36, height: 36, marginRight: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, overflow: 'hidden' }}>
                <Image width={36} height={36} src={driveImage(result.Avt) || driveImage(result.avt) || 'https://lh3.googleusercontent.com/d/1iq7y8VE0OyFIiHmpnV_ueunNsTeHK1bG'} alt={result.Name || result.name} style={{ objectFit: 'cover' }} />
              </div>
              <div className={air.searchResultItem}>
                <p className={air.resultName}>{result.Name || result.name}</p>
                <p className={air.resultSubtitle}>{result.type}</p>
              </div>
            </Link>
          })
        )}
      </div>
    </div>
  );

  const menuItems = (
    <div style={{ listStyle: 'none', margin: 0, width: 180, borderRadius: 12, background: 'var(--bg-secondary)', boxShadow: 'var(--boxshaw2)', marginBottom: 8 }}>
      <div style={{ padding: 8, gap: 3 }} className='flex_col'>
        <Link href={'/setting'} className={`${air.menu_li} text_5_400`}>
          <Svg_Setting w={16} h={16} c={'var(--text-secondary)'} />Cài đặt
        </Link>
        <p className={`${air.menu_li} text_5_400`} onClick={() => setActiveMenu(2)}>
          <Svg_Mode w={16} h={16} c={'var(--text-secondary)'} />Giao diện
        </p>
      </div>
      <div style={{ padding: 8, borderTop: 'thin solid var(--border-color)' }} onClick={logout}>
        <p className={`${air.menu_li} ${air.logout} text_5_400`}>
          <Svg_Logout w={16} h={16} c={'white'} />Đăng xuất
        </p>
      </div>
    </div>
  );

  const menuMode = (
    <div style={{ listStyle: 'none', margin: 0, width: 210, borderRadius: 12, background: 'var(--bg-secondary)', boxShadow: 'var(--boxshaw2)', marginBottom: 8 }}>
      <div style={{ padding: 8, borderBottom: 'thin solid var(--border-color)', justifyContent: 'start', gap: 8 }} className='flex_center'>
        <div onClick={() => setActiveMenu(1)}>
          <WrapIcon icon={<Svg_Left w={12} h={12} c={'var(--text-secondary)'} />} w={'32px'} />
        </div>
        <h5>Chế độ giao diện</h5>
        <Svg_Mode w={16} h={16} c={'var(--text-secondary)'} />
      </div>
      <div style={{ padding: 8 }}>
        <div className={`${air.menu_li} text_5_400`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={toggleTheme}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Svg_Dark w={18} h={18} c={'var(--text-secondary)'} />
            <h6 style={{ flex: 1, marginLeft: 8 }}>Giao diện Tối</h6>
          </div>
          <Switch checked={isDark} size="small" activeColor="#ffffff" inactiveColor="#ddd" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className='flex_col' style={{ justifyContent: 'space-between', height: '100%', alignItems: 'center' }}>
        <div style={{ height: 100, width: 100, minHeight: 100 }} className="flex_center">
          <p className="text_1">
            <span style={{ color: 'var(--main_d)' }}> AI</span>
            <span>R</span>
          </p>
        </div>
        <div className={air.container} ref={navContainerRef}>
          {activeIndex !== -1 && ( // Điều kiện highlight chỉ cần activeIndex tồn tại
            <div
              className={air.highlight}
              style={{ transform: `translateY(${barOffset}px)`, transition: 'transform .3s ease-in-out' }}
            />
          )}
          {/* Map trực tiếp qua toàn bộ itemsToDisplay */}
          {itemsToDisplay.map(({ href, icon, content }) => (
            <div
              key={href}
              className={air.navItem}
              onClick={() => handleNavItemClick(href)}
            >
              {icon}
              <p className={air.navText}>{content}</p>
            </div>
          ))}
          {/* Nút "Thêm" và Popup "Thêm" đã được bỏ đi */}
        </div>

        {/* Popup tìm kiếm vẫn giữ nguyên */}
        <FlexiblePopup
          open={isSearchPopupOpen}
          onClose={() => setIsSearchPopupOpen(false)}
          renderItemList={renderSearchContent}
          title="Tìm kiếm"
          width={'400px'}
        />

        <div>
          <Menu
            isOpen={isMenuOpen}
            menuItems={activeMenu === 1 ? menuItems : menuMode}
            menuPosition="top"
            customButton={
              <div className={air.navItem} style={{ marginBottom: 8 }}>
                <Svg_Menu w={22} h={22} c={'var(--text-primary)'} />
                <p className={air.navText} style={{ marginTop: 2 }}>Thêm</p>
              </div>
            }
            style={`display: 'flex'`}
            onOpenChange={(isOpen) => {
              setIsMenuOpen(isOpen);
              if (!isOpen) setActiveMenu(1);
            }}
          />
        </div>
      </div>
      {load && (
        <div className={air.loading}>
          <Loading content={<p className='text_6_400' style={{ color: 'white' }}>Đang đăng xuất...</p>} />
        </div>
      )}
    </>
  );
}