using Microsoft.AspNetCore.Mvc;
using ELCS.API.Services;

namespace ELCS.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly ILogger<AuthController> _logger;
    private readonly IAuthService _authService;

    public AuthController(ILogger<AuthController> logger, IAuthService authService)
    {
        _logger = logger;
        _authService = authService;
    }

    [HttpPost("login")]
    [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (string.IsNullOrEmpty(request.Email) || string.IsNullOrEmpty(request.Password))
        {
            return BadRequest(new { error = "Email and password are required" });
        }

        var result = await _authService.AuthenticateAsync(request.Email, request.Password);

        if (result == null)
        {
            return Unauthorized(new { error = "Invalid email or password" });
        }

        // Add cache control headers to prevent caching
        Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        Response.Headers["Pragma"] = "no-cache";
        Response.Headers["Expires"] = "0";

        return Ok(new
        {
            success      = true,
            employee_id  = result.EmployeeId,
            full_name    = result.FullName,
            email        = result.Email,
            phone        = result.Phone,
            designation  = result.Designation,
            company_name = result.CompanyName,
            role_id      = result.RoleId,
            role_name    = result.RoleName,
            permissions  = result.Permissions  // JSON array string or null (null = no role = full access)
        });
    }

    [HttpGet("profile/{employeeId:int}")]
    public async Task<IActionResult> GetProfile(int employeeId)
    {
        var employee = await _authService.GetEmployeeByIdAsync(employeeId);
        if (employee == null)
            return NotFound(new { error = "Employee not found" });

        return Ok(new
        {
            employee_id  = employee.EmployeeId,
            full_name    = employee.FullName,
            email        = employee.Email,
            phone        = employee.Phone,
            designation  = employee.Designation,
            company_name = employee.CompanyName
        });
    }

    [HttpPut("profile/{employeeId:int}")]
    public async Task<IActionResult> UpdateProfile(int employeeId, [FromBody] UpdateProfileRequest request)
    {
        var ok = await _authService.UpdateProfileAsync(employeeId, request);
        if (!ok)
            return NotFound(new { error = "Employee not found" });

        return Ok(new { success = true, message = "Profile updated" });
    }
}

public record LoginRequest(string Email, string Password);
