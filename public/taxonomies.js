// public/taxonomies.js
// Same taxonomies as the Skill's assets/*.py files, mirrored here so the
// browser-side classifier can use them without a build step.

const TAXONOMIES = {
  banking_vn: {
    label: 'Ngân hàng số (Tiếng Việt)',
    fallback: 'Khác',
    categories: {
      'Lỗi/Crash ứng dụng':
        'App bị crash, đơ, treo, văng ra ngoài, force-close, hoặc lỗi kỹ thuật khiến một chức năng cụ thể không hoạt động được trong quá trình sử dụng bình thường.',
      'Hiệu năng/Tốc độ':
        'App chạy chậm, load lâu, chờ đợi kéo dài khi mở app/thực hiện giao dịch, hoặc tốn nhiều pin/dữ liệu/dung lượng. Không kèm lỗi cụ thể, chỉ là trải nghiệm chậm.',
      'Đăng nhập/Sinh trắc học/eKYC':
        'Khó khăn khi đăng nhập, đăng ký, xác thực sinh trắc học (quét khuôn mặt, vân tay), xác thực CCCD/căn cước gắn chip, eKYC, OTP/2FA, quên mật khẩu, hoặc các vấn đề truy cập tài khoản liên quan đến định danh.',
      'Chuyển tiền/Giao dịch thất bại':
        'Giao dịch chuyển tiền, thanh toán, nạp tiền bị lỗi, bị treo, bị trừ tiền nhưng người nhận không nhận được, giao dịch trùng/double, hoặc tiền không đến như mong đợi.',
      'Phí/Trừ tiền bất thường':
        'Phàn nàn về phí: phí thường niên, phí SMS banking, phí duy trì tài khoản, phí ẩn, hoặc bị trừ tiền không rõ lý do/không có thông báo, hoặc cảm thấy phí quá cao so với kỳ vọng.',
      'Khóa tài khoản/Khóa giao dịch':
        'Tài khoản hoặc một tính năng cụ thể (giao dịch online, chuyển tiền) bị khóa, tạm ngưng, vô hiệu hóa, có hoặc không kèm giải thích rõ ràng, khiến người dùng không thể sử dụng.',
      'UX/UI':
        'Giao diện khó hiểu, khó tìm chức năng, điều hướng kém, bố cục rối, hoặc góp ý về thiết kế/trải nghiệm không liên quan đến lỗi kỹ thuật.',
      'Chăm sóc khách hàng/Tổng đài':
        'Trải nghiệm tiêu cực với dịch vụ hỗ trợ: tổng đài không nghe máy, phản hồi chậm, không hữu ích, nhân viên tư vấn thiếu nhiệt tình, hoặc không được giải quyết vấn đề sau khi liên hệ.',
      'Thông báo/Quảng cáo':
        'Phàn nàn về tin nhắn/thông báo quảng cáo gây phiền, tần suất thông báo quá nhiều, hoặc không tắt được thông báo marketing dù đã chỉnh cài đặt.',
      'Đề xuất tính năng':
        'Gợi ý hoặc mong muốn cụ thể về một tính năng mới, hoặc cải tiến cho một tính năng đã có.',
      'Khen ngợi/Trải nghiệm tích cực':
        'Đánh giá tích cực chung chung hoặc cụ thể: khen app nhanh, an toàn, dễ dùng, nhân viên tốt, không kèm góp ý cải thiện cụ thể nào.',
      'Khác':
        'Feedback liên quan nhưng không khớp category nào ở trên — bao gồm nội dung không rõ nghĩa, spam, hoặc feedback quá chung chung không có thông tin actionable.',
    },
    // Second, independent taxonomy dimension: WHICH product/feature the review
    // is about, orthogonal to the issue-type categories above. A review gets
    // classified against both — e.g. issue="Chuyển tiền/Giao dịch thất bại"
    // + product="Chuyển tiền" for a failed transfer complaint.
    productFallback: 'Không xác định/Chung chung',
    productCategories: {
      'Quản lý thẻ':
        'Liên quan đến thẻ tín dụng hoặc thẻ ghi nợ: mở thẻ mới, kích hoạt thẻ, khóa/mở thẻ tạm thời, đổi hạn mức, sao kê thẻ tín dụng, thanh toán dư nợ thẻ, hoặc phí liên quan đến thẻ.',
      'Quản lý tài khoản':
        'Liên quan đến tài khoản thanh toán chính: xem số dư, lịch sử giao dịch, thông tin tài khoản, mở/đóng tài khoản, đổi thông tin cá nhân gắn với tài khoản.',
      'Tiết kiệm':
        'Liên quan đến gửi tiết kiệm: gửi tiết kiệm online, tất toán, kỳ hạn, lãi suất, sổ tiết kiệm.',
      'Thanh toán hóa đơn':
        'Liên quan đến thanh toán hóa đơn định kỳ: điện, nước, internet, điện thoại, học phí, hoặc các dịch vụ thanh toán hóa đơn khác qua app.',
      'Chuyển tiền':
        'Liên quan đến chuyển tiền: chuyển khoản nội bộ, chuyển khoản liên ngân hàng, chuyển tiền nhanh 24/7, quét mã QR để chuyển/nhận tiền.',
      'Dịch vụ tiện ích':
        'Liên quan đến các dịch vụ tiện ích khác trong app: nạp tiền điện thoại, mua mã thẻ, mua vé, bảo hiểm, đầu tư, hoặc các tiện ích không thuộc nhóm nào ở trên.',
    },
  },
  generic_en: {
    label: 'Generic (English) — any app',
    fallback: 'Other',
    categories: {
      'Bugs/Crashes':
        'App crashes, freezes, force-closes, hangs, or otherwise breaks during normal use. Includes reproducible bugs in specific features.',
      'Performance/Speed':
        'App is slow, laggy, takes too long to load, or consumes excessive battery/data/storage.',
      'Login/Account/KYC':
        'Trouble signing in, registering, verifying identity (KYC), OTP/2FA issues, password reset, or account access problems.',
      'Payment/Transaction Failure':
        'A payment, purchase, transfer, or transaction failed, got stuck, was duplicated/double-charged, or money did not arrive as expected.',
      'Pricing/Fees':
        'Complaints about cost: unexpected fees, fees felt too high, hidden charges, or unclear pricing/billing.',
      'UX/UI':
        'Confusing layout, hard-to-find features, poor navigation, cluttered screens, or general usability/design complaints not tied to a bug.',
      'Customer Support':
        'Negative experience with support: unhelpful responses, long wait times, no response, or rude/unhelpful staff.',
      'Feature Request':
        'Explicit suggestion or wish for a new feature, or improvement to an existing one.',
      'Account Suspension/Lock':
        'Account or a specific feature was locked, suspended, disabled, or banned, with or without explanation.',
      Other:
        "Relevant feedback that doesn't fit any category above — including generic praise/complaints with no specific actionable issue.",
    },
    // No product/feature dimension for the generic taxonomy — it's meant for
    // arbitrary apps where a banking-style product list doesn't apply.
  },
};

window.TAXONOMIES = TAXONOMIES;
