const MODEL = "gemini-3.8-flash";

const AGENTS = {
  ceo: {
    name: "CEO Orchestrator",
    instruction: "Bạn là CEO Orchestrator của NEXA AI LAB. Phân tích mục tiêu, chia thành các đầu việc rõ ràng, nêu thứ tự ưu tiên, phụ thuộc, đầu ra cần có và rủi ro. Không giả vờ đã giao việc cho hệ thống bên ngoài."
  },
  researcher: {
    name: "Market Researcher",
    instruction: "Bạn là Market Researcher. Phân biệt dữ kiện đã được cung cấp, suy luận và điều chưa biết. Không bịa số liệu, nguồn hoặc kết quả khảo sát. Đề xuất cách kiểm chứng."
  },
  strategist: {
    name: "Idea Strategist",
    instruction: "Bạn là Idea Strategist. Đề xuất các ý tưởng khác biệt, đánh giá theo giá trị người dùng, độ khả thi, chi phí và rủi ro. Chọn đề xuất tốt nhất và giải thích."
  },
  product: {
    name: "Product Manager",
    instruction: "Bạn là Product Manager. Chuyển mục tiêu thành PRD ngắn gồm người dùng mục tiêu, vấn đề, MVP, ngoài phạm vi, tiêu chí nghiệm thu và câu hỏi còn mở."
  },
  designer: {
    name: "Designer",
    instruction: "Bạn là UI/UX Designer. Đề xuất luồng sử dụng, cấu trúc màn hình, nội dung giao diện, trạng thái tải/lỗi/rỗng và nguyên tắc tiếp cận. Không tuyên bố đã tạo file thiết kế."
  },
  developer: {
    name: "Developer",
    instruction: "Bạn là Software Developer. Đề xuất kiến trúc và các bước triển khai an toàn. Khi viết code, nêu tên file và cung cấp code có thể kiểm tra. Không tuyên bố đã chạy hoặc deploy nếu chưa thực sự chạy."
  },
  qa: {
    name: "QA Tester",
    instruction: "Bạn là QA Tester. Tạo test cases có bước thực hiện, kết quả mong đợi, mức độ ưu tiên. Tìm edge cases và vấn đề bảo mật. Không tuyên bố đã chạy test nếu chưa chạy."
  },
  marketing: {
    name: "Marketing Strategist",
    instruction: "Bạn là Marketing Strategist. Xác định định vị, thông điệp, nhóm khách hàng, kênh và kế hoạch nội dung thử nghiệm. Không bảo đảm lượt xem, doanh thu hoặc kết quả."
  },
  finance: {
    name: "Finance Analyst",
    instruction: "Bạn là Finance Analyst. Lập giả định chi phí/doanh thu minh bạch, nêu công thức và kịch bản thận trọng. Không bảo đảm lợi nhuận và không giả vờ là cố vấn tài chính."
  }
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-NEXA-CODE"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        service: "NEXA Gemini Bridge",
        status: env.GEMINI_API_KEY ? "key_configured" : "missing_gemini_key",
        model: MODEL,
        note: "Health check does not send a prompt to Gemini."
      });
    }

    if (request.method !== "POST" || url.pathname !== "/api/agent") {
      return json({ error: "Not found" }, 404);
    }

    if (!env.GEMINI_API_KEY) {
      return json({ error: "Server chưa được cấu hình GEMINI_API_KEY." }, 503);
    }
    if (!env.NEXA_GATE_CODE) {
      return json({ error: "Server chưa được cấu hình NEXA_GATE_CODE." }, 503);
    }
    if (request.headers.get("X-NEXA-CODE") !== env.NEXA_GATE_CODE) {
      return json({ error: "Mã truy cập không hợp lệ." }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Body phải là JSON hợp lệ." }, 400);
    }

    const role = String(body.role || "");
    const task = String(body.task || "").trim();
    const agent = AGENTS[role];

    if (!agent) return json({ error: "Vai trò AI không hợp lệ." }, 400);
    if (!task) return json({ error: "Bạn chưa nhập nhiệm vụ." }, 400);
    if (task.length > 12000) {
      return json({ error: "Nhiệm vụ quá dài. Giới hạn hiện tại là 12.000 ký tự." }, 413);
    }

    const prompt = [
      "Bạn đang làm việc trong hệ thống NEXA AI LAB.",
      `VAI TRÒ: ${agent.name}.`,
      `CHỈ DẪN: ${agent.instruction}`,
      "Quy tắc chung: trả lời bằng tiếng Việt; nêu rõ giả định; không bịa dữ kiện; nếu thiếu thông tin hãy nói rõ.",
      "",
      "NHIỆM VỤ:",
      task
    ].join("\n");

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

    let upstream;
    try {
      upstream = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 1200
          }
        })
      });
    } catch {
      return json({ error: "Không kết nối được Gemini. Hãy thử lại sau." }, 502);
    }

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      // Do not return provider response headers or secrets to the browser.
      const message = result?.error?.message || "Gemini API trả về lỗi.";
      return json({ error: message, providerStatus: upstream.status }, 502);
    }

    const text = (result?.candidates?.[0]?.content?.parts || [])
      .map(part => part.text || "")
      .join("\n")
      .trim();

    if (!text) {
      return json({
        error: "Gemini không trả về nội dung. Có thể yêu cầu bị chặn hoặc hết hạn mức.",
        finishReason: result?.candidates?.[0]?.finishReason || null
      }, 502);
    }

    return json({
      ok: true,
      provider: "Google Gemini API",
      model: MODEL,
      role,
      agent: agent.name,
      output: text,
      usage: result.usageMetadata || null,
      generatedAt: new Date().toISOString()
    });
  }
};
