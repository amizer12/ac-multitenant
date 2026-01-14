from strands import tool
import math
import re

@tool
def calculator(expression: str) -> str:
    """
    Perform mathematical calculations.
    
    This tool evaluates mathematical expressions safely, supporting
    basic arithmetic and common mathematical functions.
    
    Args:
        expression: Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)", "sin(pi/2)")
        
    Returns:
        Calculation result as string
        
    Example:
        result = calculator("2 * (3 + 4)")
        result = calculator("sqrt(144)")
    """
    try:
        # Safe evaluation with limited scope
        allowed_names = {
            'abs': abs, 'round': round, 'min': min, 'max': max,
            'sum': sum, 'pow': pow,
            'sqrt': math.sqrt, 'sin': math.sin, 'cos': math.cos,
            'tan': math.tan, 'log': math.log, 'log10': math.log10,
            'exp': math.exp, 'floor': math.floor, 'ceil': math.ceil,
            'pi': math.pi, 'e': math.e
        }
        
        # Remove any potentially dangerous characters
        if re.search(r'[^0-9+\-*/().a-z_\s]', expression.lower()):
            return "Error: Invalid characters in expression. Only numbers, operators (+, -, *, /), parentheses, and math functions are allowed."
        
        # Evaluate expression
        result = eval(expression, {"__builtins__": {}}, allowed_names)
        
        # Format result
        if isinstance(result, float):
            # Round to reasonable precision
            if result.is_integer():
                return f"Result: {int(result)}"
            else:
                return f"Result: {round(result, 10)}"
        else:
            return f"Result: {result}"
            
    except ZeroDivisionError:
        return "Error: Division by zero"
    except SyntaxError:
        return f"Error: Invalid syntax in expression: '{expression}'"
    except NameError as e:
        return f"Error: Unknown function or variable: {str(e)}"
    except Exception as e:
        return f"Error calculating expression: {str(e)}"
