// รายชื่อสินค้า [[ชื่อ, ราคา, น้ำหนักกรัม], ...] จากชีต Master ใน mirror (ผ่าน Members.gs จำลอง) ใช้แทนไฟล์ snapshot
import { createGas, loadBookFromMirror, loadPropsFromMirror } from './gasmock.mjs';
export function loadSkus(membersGs) {
  if (!membersGs) throw new Error('ต้องระบุ path ของ Members.gs');
  loadBookFromMirror('15yYmENUcxz5VO1ajhkAgU-seeZ3cMCs43Jm4xlYKvFk', 'members', 'Members');
  loadBookFromMirror('1aZ3wp-9dU1jNoQ-FVpA9uKNNOYJSSEGmL8IjZXU_40w', 'master', 'Master');
  loadPropsFromMirror();
  const { ctx } = createGas([membersGs]);
  const out = [];
  ctx.getShopProducts().categories.forEach((cat) => cat.variants.forEach((v) => out.push([v.skuName, v.price, v.weightG || 0])));
  return out;
}
