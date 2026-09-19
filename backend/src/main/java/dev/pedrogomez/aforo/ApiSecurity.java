package dev.pedrogomez.aforo;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
class ApiSecurity extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        if (request.getMethod().equals("POST")) {
            String origin = request.getHeader("Origin");
            String expected = request.getScheme() + "://" + request.getHeader("Host");
            if ("cross-site".equals(request.getHeader("Sec-Fetch-Site")) || (origin != null && !origin.equals(expected))) {
                response.sendError(403, "Origen no permitido");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}
